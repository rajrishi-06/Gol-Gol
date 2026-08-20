\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

create or replace function chk(label text, got anyelement, want anyelement) returns void
language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  % (%)', label, got;
  else raise notice 'FAIL  % — got %, wanted %', label, got, want; end if;
end $$;

insert into auth.users (id, phone, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001','+919300000001','{"name":"Both Ways"}'),
  ('c0000000-0000-4000-8000-000000000002','+919300000002','{"name":"Bike Rider"}'),
  ('c0000000-0000-4000-8000-000000000003','+919300000003','{"name":"Next Rider"}'),
  ('c0000000-0000-4000-8000-000000000004','+919300000004','{"name":"Other Driver"}'),
  ('c0000000-0000-4000-8000-00000000000a','+919300000099','{"name":"Admin"}');
update public.users set is_admin=true where id='c0000000-0000-4000-8000-00000000000a';

-- one person who both drives a bike and rides, plus a second driver
insert into public.drivers (user_id, vehicle_type, vehicle_class) values
  ('c0000000-0000-4000-8000-000000000001','bike','bike'),
  ('c0000000-0000-4000-8000-000000000004','bike','bike');
insert into public.active_drivers (user_id, is_online, current_lat, current_lng, heartbeat_at) values
  ('c0000000-0000-4000-8000-000000000001', true, 12.97, 77.50, now()),
  ('c0000000-0000-4000-8000-000000000004', true, 12.97, 77.50, now());
select test_as('c0000000-0000-4000-8000-00000000000a');
select public.set_driver_verification('c0000000-0000-4000-8000-000000000001','approved');
select public.set_driver_verification('c0000000-0000-4000-8000-000000000004','approved');

create or replace function bk(who uuid, flng numeric, tlng numeric, cls text default 'bike')
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform test_as(who);
  insert into public.rides (rider_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address, vehicle_type)
  values (who, 12.97, flng, 12.97, tlng, 'from '||flng, 'to '||tlng, cls) returning id into v;
  return v;
end $$;
create or replace function otp_of(r uuid) returns text language sql as $$
  select otp from public.ride_otps where ride_id = r $$;

\set QUIET off
\echo ''
\echo '══════ A · one account, and the mode it is actually in ══════'
select test_as('c0000000-0000-4000-8000-000000000001');
select chk('starts idle', public.current_mode(), 'idle');
select public.set_user_mode('available');
select chk('going on duty is a real transition', public.current_mode(), 'available');
select chk('and flips the duty flag with it', is_online, true)
  from public.active_drivers where user_id='c0000000-0000-4000-8000-000000000001';

\echo ''
\echo '══════ B · you cannot drive while you are a passenger ══════'
-- our driver books a ride of their own and another driver picks it up
select set_config('t.own', bk('c0000000-0000-4000-8000-000000000001'::uuid, 77.50, 77.56)::text, false);
select chk('booking puts them in seeking', public.current_mode('c0000000-0000-4000-8000-000000000001'), 'seeking');

select test_as('c0000000-0000-4000-8000-000000000004');
select chk('the other driver accepts', status, 'accepted')
  from public.accept_ride(current_setting('t.own')::uuid);
select ok from public.start_ride(current_setting('t.own')::uuid, otp_of(current_setting('t.own')::uuid), 1::smallint);
select chk('now they are riding', public.current_mode('c0000000-0000-4000-8000-000000000001'), 'riding');

select test_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.set_user_mode('available');
  raise notice 'FAIL  a passenger was allowed to go on duty';
exception when others then raise notice 'PASS  going on duty is refused mid-ride (%)', sqlerrm;
end $$;

select set_config('t.other', bk('c0000000-0000-4000-8000-000000000003'::uuid, 77.60, 77.66)::text, false);
select test_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.accept_ride(current_setting('t.other')::uuid);
  raise notice 'FAIL  a passenger was dispatched a ride to drive';
exception when others then raise notice 'PASS  dispatch is refused mid-ride (%)', sqlerrm;
end $$;

\echo ''
\echo '══════ C · ...and you cannot book a ride while driving one ══════'
select test_as('c0000000-0000-4000-8000-000000000004');
select chk('the driver is on a trip', public.current_mode('c0000000-0000-4000-8000-000000000004'), 'on_trip');
do $$ begin
  insert into public.rides (rider_id, from_lat, from_lng, to_lat, to_lng, vehicle_type)
  values ('c0000000-0000-4000-8000-000000000004', 12.97, 77.50, 12.97, 77.55, 'bike');
  raise notice 'FAIL  a driver mid-trip booked themselves a ride';
exception when others then raise notice 'PASS  booking is refused mid-trip (%)', sqlerrm;
end $$;

\echo ''
\echo '══════ D · a bike chains the next fare — it can never pool ══════'
-- the other driver is nearly done; a request sits near where they finish
select set_config('t.next', bk('c0000000-0000-4000-8000-000000000003'::uuid, 77.5615, 77.62)::text, false);
select test_as('c0000000-0000-4000-8000-000000000004');
update public.active_drivers set current_lat=12.97, current_lng=77.555
 where user_id='c0000000-0000-4000-8000-000000000004';

select chk('a bike is offered nothing to pool', count(*), 0::bigint) from public.poolable_rides();
select chk('but is offered the next fare', count(*), 1::bigint) from public.chainable_rides();
select rider_name, pickup_from_drop_km, free_in_min from public.chainable_rides();

select chk('and can take it', status, 'accepted')
  from public.accept_chained_ride(current_setting('t.next')::uuid);

\echo ''
\echo '   the bike now has a queue, never two riders at once:'
select s.seq, s.kind, split_part(u.name,' ',1) as who, s.seat_delta, s.reached_at is not null as done
  from public.trip_stops s join public.rides r on r.id=s.ride_id join public.users u on u.id=r.rider_id
 where s.trip_id=(select id from public.trips where driver_id='c0000000-0000-4000-8000-000000000004')
 order by s.seq;

select chk('one seat, and it never doubles up', seat_capacity, 1::smallint)
  from public.trips where driver_id='c0000000-0000-4000-8000-000000000004';

\echo ''
\echo '══════ E · a second queued fare is refused ══════'
select set_config('t.third', bk('c0000000-0000-4000-8000-000000000002'::uuid, 77.5620, 77.63)::text, false);
select test_as('c0000000-0000-4000-8000-000000000004');
select chk('nothing more is offered', count(*), 0::bigint) from public.chainable_rides();
do $$ begin
  perform public.accept_chained_ride(current_setting('t.third')::uuid);
  raise notice 'FAIL  a third booking was queued';
exception when others then raise notice 'PASS  refused (%)', sqlerrm;
end $$;

\echo ''
\echo '══════ F · finishing one leg frees the rider and starts the next ══════'
select chk('first rider settles', status, 'completed')
  from public.complete_ride(current_setting('t.own')::uuid);
select chk('they are idle again', public.current_mode('c0000000-0000-4000-8000-000000000001'), 'idle');
select chk('the driver is still on the trip', public.current_mode('c0000000-0000-4000-8000-000000000004'), 'on_trip');
select chk('because the next fare is waiting', status, 'accepted')
  from public.rides where id=current_setting('t.next')::uuid;

select ok from public.start_ride(current_setting('t.next')::uuid, otp_of(current_setting('t.next')::uuid), 1::smallint);
select chk('second rider settles', status, 'completed')
  from public.complete_ride(current_setting('t.next')::uuid);
select chk('and only now is the driver free', public.current_mode('c0000000-0000-4000-8000-000000000004'), 'available');

\echo ''
\echo '══════ G · the ex-passenger can drive again ══════'
select test_as('c0000000-0000-4000-8000-000000000001');
select chk('going on duty now works', mode, 'available') from public.set_user_mode('available');
