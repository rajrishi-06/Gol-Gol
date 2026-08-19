\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

create or replace function chk(label text, got anyelement, want anyelement) returns void
language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  % (%)', label, got;
  else raise notice 'FAIL  % — got %, wanted %', label, got, want; end if;
end $$;

-- two drivers, one shared corridor, one contested request
insert into auth.users (id, phone, raw_user_meta_data) values
  ('d0000000-0000-4000-8000-000000000001','+919200000001','{"name":"Driver One"}'),
  ('d0000000-0000-4000-8000-000000000002','+919200000002','{"name":"Driver Two"}'),
  ('e0000000-0000-4000-8000-000000000001','+919200000011','{"name":"Rider A"}'),
  ('e0000000-0000-4000-8000-000000000002','+919200000012','{"name":"Rider B"}'),
  ('e0000000-0000-4000-8000-000000000003','+919200000013','{"name":"Rider C"}'),
  ('a0000000-0000-4000-8000-00000000000a','+919200000099','{"name":"Admin"}');
update public.users set is_admin = true where id='a0000000-0000-4000-8000-00000000000a';

insert into public.drivers (user_id, vehicle_type, vehicle_class) values
  ('d0000000-0000-4000-8000-000000000001','auto','auto'),
  ('d0000000-0000-4000-8000-000000000002','auto','auto');
insert into public.active_drivers (user_id, is_online, current_lat, current_lng, heartbeat_at) values
  ('d0000000-0000-4000-8000-000000000001', true, 12.97, 77.50, now()),
  ('d0000000-0000-4000-8000-000000000002', true, 12.97, 77.50, now());
select test_as('a0000000-0000-4000-8000-00000000000a');
select public.set_driver_verification('d0000000-0000-4000-8000-000000000001','approved');
select public.set_driver_verification('d0000000-0000-4000-8000-000000000002','approved');

create or replace function bk(who uuid, flng numeric, tlng numeric, seats smallint default 1)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform test_as(who);
  insert into public.rides (rider_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
                            vehicle_type, seats, shareable)
  values (who, 12.97, flng, 12.97, tlng, 'from '||flng, 'to '||tlng, 'auto', seats, true)
  returning id into v;
  return v;
end $$;
create or replace function otp_of(r uuid) returns text language sql as $$
  select otp from public.ride_otps where ride_id = r $$;

\set QUIET off
\echo ''
\echo '════════ A · a hold reserves both the seat and the request ════════'
select set_config('t.a', bk('e0000000-0000-4000-8000-000000000001'::uuid, 77.50, 77.60)::text, false);
select test_as('d0000000-0000-4000-8000-000000000001');
select status from public.accept_ride(current_setting('t.a')::uuid);
select ok from public.start_ride(current_setting('t.a')::uuid, otp_of(current_setting('t.a')::uuid), 1::smallint);

select set_config('t.b', bk('e0000000-0000-4000-8000-000000000002'::uuid, 77.515, 77.605)::text, false);
select test_as('d0000000-0000-4000-8000-000000000001');
select chk('driver one is offered the ride', count(*), 1::bigint) from public.poolable_rides();
select chk('two seats free before the hold', public.trip_seats_available(id), 2::smallint)
  from public.trips where driver_id='d0000000-0000-4000-8000-000000000001';

select chk('hold granted', seconds, 25) from public.hold_pool_seat(current_setting('t.b')::uuid);
select chk('the held seat is no longer free', public.trip_seats_available(id), 1::smallint)
  from public.trips where driver_id='d0000000-0000-4000-8000-000000000001';
select chk('but it is free to the holder', public.trip_seats_available(id, current_setting('t.b')::uuid), 2::smallint)
  from public.trips where driver_id='d0000000-0000-4000-8000-000000000001';

\echo ''
\echo '════════ B · nobody else can take a held request ════════'
select test_as('d0000000-0000-4000-8000-000000000002');
select chk('solo dispatch hides it', count(*), 0::bigint)
  from public.nearby_pending_rides(12.97, 77.515, 'auto', 5);
do $$ begin
  perform public.accept_ride(current_setting('t.b')::uuid);
  raise notice 'FAIL  driver two sniped a held ride';
exception when others then raise notice 'PASS  driver two is refused (%)', sqlerrm;
end $$;
select chk('and it is still pending', status, 'pending') from public.rides where id=current_setting('t.b')::uuid;

\echo ''
\echo '════════ C · the holder accepts, and it works ════════'
select test_as('d0000000-0000-4000-8000-000000000001');
select chk('accept succeeds for the holder', status, 'accepted')
  from public.accept_pooled_ride(current_setting('t.b')::uuid);
select chk('the hold is consumed', count(*), 0::bigint)
  from public.seat_holds where ride_id=current_setting('t.b')::uuid;

\echo ''
\echo '════════ D · an expired hold frees the request again ════════'
select set_config('t.c', bk('e0000000-0000-4000-8000-000000000003'::uuid, 77.52, 77.61)::text, false);
select test_as('d0000000-0000-4000-8000-000000000001');
select chk('hold taken', count(*), 1::bigint) from public.hold_pool_seat(current_setting('t.c')::uuid);
update public.seat_holds set expires_at = now() - interval '1 second'
 where ride_id = current_setting('t.c')::uuid;
select chk('sweeper collects it', public.expire_seat_holds() >= 1, true);
select test_as('d0000000-0000-4000-8000-000000000002');
select chk('now visible to the other driver', count(*), 1::bigint)
  from public.nearby_pending_rides(12.97, 77.52, 'auto', 5);

\echo ''
\echo '════════ E · a growing headcount drops holds before bookings ════════'
select test_as('d0000000-0000-4000-8000-000000000001');
select chk('re-hold for the test', count(*), 1::bigint) from public.hold_pool_seat(current_setting('t.c')::uuid);
select chk('auto is fully spoken for', public.trip_seats_available(id), 0::smallint)
  from public.trips where driver_id='d0000000-0000-4000-8000-000000000001';
\echo '   rider B turns up with a friend — 1 booked, 2 aboard:'
select chk('no booking is displaced', displaced_ride_id, null::uuid)
  from public.start_ride(current_setting('t.b')::uuid, otp_of(current_setting('t.b')::uuid), 2::smallint);
select chk('the hold was dropped instead', count(*), 0::bigint)
  from public.seat_holds where ride_id=current_setting('t.c')::uuid;
select chk('rider C keeps their booking', status, 'pending')
  from public.rides where id=current_setting('t.c')::uuid;

\echo ''
\echo '════════ F · the detour promise is measured and paid ════════'
select chk('baseline stored at booking', solo_eta_min > 0, true)
  from public.rides where id=current_setting('t.a')::uuid;

\echo '   rider A rode P(A) → P(B) → D(A): a real detour past their direct line'
select s.seq, s.kind, split_part(u.name,' ',1) as who, round(s.lng::numeric,4) as lng
  from public.trip_stops s join public.rides r on r.id=s.ride_id join public.users u on u.id=r.rider_id
 where s.trip_id=(select id from public.trips where driver_id='d0000000-0000-4000-8000-000000000001')
 order by s.seq;

select chk('promised detour recorded', promised_detour_min is not null, true)
  from public.rides where id=current_setting('t.a')::uuid;

-- force a breach: promise almost nothing, then settle
update public.rides set promised_detour_min = 0 where id=current_setting('t.a')::uuid;
update public.trip_stops set lng = 77.75 where ride_id=current_setting('t.b')::uuid and kind='pickup';
select chk('a real detour is measured', public.ride_actual_detour_min(current_setting('t.a')::uuid) > 0, true);

select chk('breach is credited', breach_credit > 0, true)
  from public.complete_ride(current_setting('t.a')::uuid);
select chk('and the rider is told', count(*), 1::bigint)
  from public.notifications where data->>'ride_id' = current_setting('t.a') and title like 'We took longer%';
select round(fare) quoted, round(pool_discount) rebate, breach_credit credit, round(final_fare) paid,
       promised_detour_min promised, actual_detour_min actual
  from public.rides where id=current_setting('t.a')::uuid;
