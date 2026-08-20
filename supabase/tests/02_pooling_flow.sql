\set ON_ERROR_STOP on
\pset pager off
\set QUIET on
\timing off


-- ── cast ────────────────────────────────────────────────────────────────────
insert into auth.users (id, phone, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','+919000000001','{"name":"Deepa Driver"}'),
  ('22222222-2222-2222-2222-222222222222','+919000000002','{"name":"Asha Rider"}'),
  ('33333333-3333-3333-3333-333333333333','+919000000003','{"name":"Bala Rider"}'),
  ('44444444-4444-4444-4444-444444444444','+919000000004','{"name":"Chetan Rider"}'),
  ('99999999-9999-9999-9999-999999999999','+919000000009','{"name":"Ops Admin"}');
update public.users set is_admin = true where id='99999999-9999-9999-9999-999999999999';

insert into public.drivers (user_id, vehicle_type, vehicle_class)
values ('11111111-1111-1111-1111-111111111111','auto','auto');
insert into public.active_drivers (user_id, is_online, current_lat, current_lng, heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', true, 12.97, 77.50, now());
select test_as('99999999-9999-9999-9999-999999999999');
select public.set_driver_verification('11111111-1111-1111-1111-111111111111','approved');

create or replace function book(who uuid, flng numeric, tlng numeric, share boolean default true,
                                seats smallint default 1, flat numeric default 12.97, tlat numeric default 12.97)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform test_as(who);
  insert into public.rides (rider_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
                            vehicle_type, seats, shareable)
  values (who, flat, flng, tlat, tlng, 'from '||flng, 'to '||tlng, 'auto', seats, share)
  returning id into v;
  return v;
end $$;

create or replace function otp_of(r uuid) returns text language sql as $$
  select otp from public.ride_otps where ride_id = r $$;

\set QUIET off
\echo ''
\echo '══════════ A · normal booking and accept ══════════'
select set_config('t.asha', book('22222222-2222-2222-2222-222222222222'::uuid, 77.50, 77.60)::text, false);
select chk('asha quoted for 1 seat', fare, 156::numeric) from public.rides where id = current_setting('t.asha')::uuid;

select test_as('11111111-1111-1111-1111-111111111111');
select chk('accept_ride returns accepted', status, 'accepted')
  from public.accept_ride(current_setting('t.asha')::uuid);
select chk('trip opened with auto capacity', seat_capacity, 3::smallint)
  from public.trips where driver_id='11111111-1111-1111-1111-111111111111';

\echo ''
\echo '══════════ B · headcount at pickup drives the fare ══════════'
select ok from public.start_ride(current_setting('t.asha')::uuid, otp_of(current_setting('t.asha')::uuid), 2::smallint);
select chk('asha repriced for 2 travelling', fare, 218::numeric) from public.rides where id = current_setting('t.asha')::uuid;
select chk('one seat left in the auto', public.trip_seats_available(id), 1::smallint)
  from public.trips where status='active';

\echo ''
\echo '══════════ C · what must NOT be offered ══════════'
-- each candidate below is the only pending ride, so a non-zero count is a miss
select set_config('t.c', book('44444444-4444-4444-4444-444444444444'::uuid, 77.59, 77.54)::text, false);
select test_as('11111111-1111-1111-1111-111111111111');
select chk('wrong way down the corridor', count(*), 0::bigint) from public.poolable_rides();
do $$ begin
  perform public.accept_pooled_ride(current_setting('t.c')::uuid);
  raise notice 'FAIL  wrong-way ride was accepted anyway';
exception when others then raise notice 'PASS  server refuses it directly (%)', sqlerrm;
end $$;

update public.rides set from_lng=77.54, to_lng=77.59, from_lat=13.025, to_lat=13.025 where id=current_setting('t.c')::uuid;
select chk('6 km off the corridor', count(*), 0::bigint) from public.poolable_rides();

update public.rides set from_lat=12.97, to_lat=12.97, shareable=false where id=current_setting('t.c')::uuid;
select chk('rider did not opt into sharing', count(*), 0::bigint) from public.poolable_rides();

update public.rides set shareable=true, seats=2 where id=current_setting('t.c')::uuid;
select chk('needs 2 seats, only 1 free', count(*), 0::bigint) from public.poolable_rides();

update public.rides set seats=1, from_lng=77.60, to_lng=77.615 where id=current_setting('t.c')::uuid;
select chk('pickup 10 km ahead = too long a wait', count(*), 0::bigint) from public.poolable_rides();

-- a pickup close enough to reach inside max_pickup_wait_min is the control case
update public.rides set from_lng=77.515, to_lng=77.59 where id=current_setting('t.c')::uuid;
select chk('on-corridor 1-seater IS offered', count(*), 1::bigint) from public.poolable_rides();
update public.rides set status='cancelled' where id=current_setting('t.c')::uuid;

\echo ''
\echo '══════════ D · the second rider travels FURTHER than the first ══════════'
select set_config('t.bala', book('33333333-3333-3333-3333-333333333333'::uuid, 77.53, 77.6185)::text, false);
select test_as('11111111-1111-1111-1111-111111111111');
select chk('bala is offered', count(*), 1::bigint) from public.poolable_rides();
select chk('pickup sits on the route', pickup_offset_km, 0.00::numeric) from public.poolable_rides();
select chk('drop runs 2 km past the end', drop_offset_km, 2.00::numeric) from public.poolable_rides();

select chk('accepted onto the trip', status, 'accepted')
  from public.accept_pooled_ride(current_setting('t.bala')::uuid);
select chk('auto is now full', public.trip_seats_available(id), 0::smallint)
  from public.trips where status='active';

\echo ''
\echo '   stop order the driver drives:'
select s.seq, s.kind, split_part(u.name,' ',1) as rider, s.seat_delta, s.reached_at is not null as done
  from public.trip_stops s join public.rides r on r.id=s.ride_id join public.users u on u.id=r.rider_id
 where s.trip_id=(select id from public.trips where status='active') order by s.seq;

\echo ''
\echo '══════════ E · dropping one rider must not end the trip ══════════'
select ok from public.start_ride(current_setting('t.bala')::uuid, otp_of(current_setting('t.bala')::uuid), 1::smallint);
select chk('asha billed for 2 seats', seat_surcharge > 0, true)
  from public.complete_ride(current_setting('t.asha')::uuid);
select chk('trip still running for bala', status, 'active') from public.trips where driver_id='11111111-1111-1111-1111-111111111111';
select chk('driver still on a job', on_ride, true) from public.active_drivers where user_id='11111111-1111-1111-1111-111111111111';

select chk('bala settles', final_fare > 0, true) from public.complete_ride(current_setting('t.bala')::uuid);
select chk('trip closes on the last drop', status, 'completed') from public.trips where driver_id='11111111-1111-1111-1111-111111111111';
select chk('driver is free again', on_ride, false) from public.active_drivers where user_id='11111111-1111-1111-1111-111111111111';

\echo ''
\echo '   the bill:'
select split_part(u.name,' ',1) as rider, r.seats booked, r.seats_occupied travelled, r.pooled,
       r.fare quoted, r.seat_surcharge surcharge, r.pool_discount rebate, r.final_fare paid, p.driver_payout
  from public.rides r join public.users u on u.id=r.rider_id
  left join public.payments p on p.ride_id=r.id
 where r.status='completed' order by 1;

\echo ''
\echo '══════════ F · occupancy growth displaces an accepted booking ══════════'
\set QUIET on
select test_as('11111111-1111-1111-1111-111111111111');
update public.active_drivers set current_lat=12.97, current_lng=77.50 where user_id='11111111-1111-1111-1111-111111111111';
\set QUIET off

select set_config('t.d1', book('22222222-2222-2222-2222-222222222222'::uuid, 77.50, 77.60)::text, false);
select test_as('11111111-1111-1111-1111-111111111111');
select status from public.accept_ride(current_setting('t.d1')::uuid);

select set_config('t.d2', book('33333333-3333-3333-3333-333333333333'::uuid, 77.515, 77.6185)::text, false);
select test_as('11111111-1111-1111-1111-111111111111');
select chk('second booking accepted while 2 seats free', status, 'accepted')
  from public.accept_pooled_ride(current_setting('t.d2')::uuid);

\echo '   now the first rider turns up with TWO friends — 3 bodies in a 3-seat auto:'
select chk('the accepted booking is displaced', displaced_ride_id, current_setting('t.d2')::uuid)
  from public.start_ride(current_setting('t.d1')::uuid, otp_of(current_setting('t.d1')::uuid), 3::smallint);
select chk('displaced rider is back on the market', status, 'pending')
  from public.rides where id=current_setting('t.d2')::uuid;
select chk('and pays nothing for it', cancellation_fee, 0::numeric)
  from public.rides where id=current_setting('t.d2')::uuid;
select chk('they were told', count(*), 1::bigint)
  from public.notifications where data->>'ride_id' = current_setting('t.d2');
select chk('their stops are off the schedule', count(*), 0::bigint)
  from public.trip_stops where ride_id=current_setting('t.d2')::uuid;

\echo ''
\echo '══════════ G · capacity holds under a direct attack ══════════'
select set_config('t.d3', book('44444444-4444-4444-4444-444444444444'::uuid, 77.515, 77.59)::text, false);
select test_as('11111111-1111-1111-1111-111111111111');
do $$ begin
  perform public.accept_pooled_ride(current_setting('t.d3')::uuid);
  raise notice 'FAIL  a full auto took another booking';
exception when others then raise notice 'PASS  full auto refuses (%)', sqlerrm;
end $$;
select chk('seats available reads zero', public.trip_seats_available(id), 0::smallint)
  from public.trips where status='active';

\echo ''
select expect(29);
