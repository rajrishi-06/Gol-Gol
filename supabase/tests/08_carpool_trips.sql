\set ON_ERROR_STOP on
\pset pager off
\set QUIET on
\timing off

-- ============================================================================
-- A published carpool ride, carried through to a real tracked journey.
--
-- Before 0013, everything below the first section was untestable because it
-- did not exist: accepting a seat request appended JSON to a column and the
-- feature ended there.
-- ============================================================================

insert into auth.users (id, phone, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001','+919700000001','{"name":"Dev Driver"}'),
  ('c0000000-0000-4000-8000-000000000002','+919700000002','{"name":"Riya Rider"}'),
  ('c0000000-0000-4000-8000-000000000003','+919700000003','{"name":"Sam Rider"}'),
  ('c0000000-0000-4000-8000-000000000004','+919700000004','{"name":"Far Rider"}'),
  ('c0000000-0000-4000-8000-00000000000a','+919700000009','{"name":"Ops"}');
update public.users set is_admin = true where id='c0000000-0000-4000-8000-00000000000a';

insert into public.drivers (user_id, vehicle_type, vehicle_class, document_path)
values ('c0000000-0000-4000-8000-000000000001','car','sedan','c0000000-0000-4000-8000-000000000001/licence.jpg');
insert into public.active_drivers (user_id, is_online, heartbeat_at)
values ('c0000000-0000-4000-8000-000000000001', true, now());
select test_as('c0000000-0000-4000-8000-00000000000a');
select public.set_driver_verification('c0000000-0000-4000-8000-000000000001','approved');

-- A route east along a line of latitude: 77.50 → 77.70.
select test_as('c0000000-0000-4000-8000-000000000001');
insert into public.published_rides
  (id, driver_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
   available_seats, fare_per_seat, departure_time)
values ('cbbb0000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
        12.97, 77.50, 12.97, 77.70, 'Origin', 'Destination', 3, 90, now() + interval '3 hours');

create or replace function req(who uuid, plng numeric, dlng numeric, seats int default 1,
                               plat numeric default 12.97, dlat numeric default 12.97)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform test_as(who);
  insert into public.ride_requests (published_ride_id, rider_id, seats_requested,
                                    pickup_lat, pickup_lng, drop_lat, drop_lng)
  values ('cbbb0000-0000-4000-8000-000000000001', who, seats, plat, plng, dlat, dlng)
  returning id into v;
  return v;
end $$;

\set QUIET off
\echo ''
\echo '══════════ A · accepting a seat creates a real journey ══════════'
select set_config('t.riya', req('c0000000-0000-4000-8000-000000000002'::uuid, 77.52, 77.62)::text, false);
select test_as('c0000000-0000-4000-8000-000000000001');
select chk('the driver accepts the request', public.accept_ride_request(current_setting('t.riya')::uuid), true);

select chk('a trip now exists for the published ride',
  (select count(*) from public.trips where published_ride_id='cbbb0000-0000-4000-8000-000000000001'), 1::bigint);
select chk('capacity is the seats offered',
  (select seat_capacity from public.trips where published_ride_id='cbbb0000-0000-4000-8000-000000000001'), 3::smallint);
select chk('the request now points at a ride',
  (select ride_id is not null from public.ride_requests where id=current_setting('t.riya')::uuid), true);
select chk('the rider has a booking',
  (select count(*) from public.rides where rider_id='c0000000-0000-4000-8000-000000000002'), 1::bigint);
select chk('it is attached to the trip',
  (select r.trip_id = t.id from public.rides r, public.trips t
    where r.rider_id='c0000000-0000-4000-8000-000000000002'
      and t.published_ride_id='cbbb0000-0000-4000-8000-000000000001'), true);
select chk('it carries a boarding code',
  (select count(*) from public.ride_otps o join public.rides r on r.id=o.ride_id
    where r.rider_id='c0000000-0000-4000-8000-000000000002'), 1::bigint);
select chk('pickup and drop are on the schedule',
  (select count(*) from public.trip_stops s join public.rides r on r.id=s.ride_id
    where r.rider_id='c0000000-0000-4000-8000-000000000002'), 2::bigint);
select chk('a seat came off the published ride',
  (select available_seats from public.published_rides where id='cbbb0000-0000-4000-8000-000000000001'), 2);

\echo ''
\echo '   the price is the one that was advertised, not the meter''s:'
select chk('one seat at the published price',
  (select fare from public.rides where rider_id='c0000000-0000-4000-8000-000000000002'), 90::numeric);
select chk('and it is marked as fixed',
  (select fare_locked from public.rides where rider_id='c0000000-0000-4000-8000-000000000002'), true);

\echo ''
\echo '   booking a seat is not the same as standing on a kerb:'
select chk('the rider is still free to hail',
  coalesce((select mode from public.user_modes where user_id='c0000000-0000-4000-8000-000000000002'), 'idle'),
  'idle');

\echo ''
\echo '══════════ B · a request off the published route is refused ══════════'
\echo '   (this used to be accepted, and discovered at departure)'
-- Run while seats remain: with none left, accept bails on inventory first and
-- a refusal here would prove nothing about the corridor.
-- 0.5° of latitude is ~55 km north of a route that runs due east.
select set_config('t.far', req('c0000000-0000-4000-8000-000000000004'::uuid, 77.55, 77.60, 1, 13.47, 13.47)::text, false);
select test_as('c0000000-0000-4000-8000-000000000001');
select chk('control — a seat is still free',
  (select available_seats from public.published_rides where id='cbbb0000-0000-4000-8000-000000000001'), 2);
do $$ begin
  perform public.accept_ride_request(current_setting('t.far')::uuid);
  perform chk('a rider 55 km off the route is refused', false, true);
exception when others then perform chk('a rider 55 km off the route is refused', true, true);
end $$;
select chk('and no booking was made for them',
  (select count(*) from public.rides where rider_id='c0000000-0000-4000-8000-000000000004'), 0::bigint);

\echo ''
\echo '   nor is a drop behind the pickup:'
select set_config('t.back', req('c0000000-0000-4000-8000-000000000004'::uuid, 77.65, 77.55)::text, false);
select test_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.accept_ride_request(current_setting('t.back')::uuid);
  perform chk('a backwards journey is refused', false, true);
exception when others then perform chk('a backwards journey is refused', true, true);
end $$;

\echo ''
\echo '   and the refused seats are still on sale:'
select chk('nothing was taken off the ride',
  (select available_seats from public.published_rides where id='cbbb0000-0000-4000-8000-000000000001'), 2);

\echo ''
\echo '══════════ B2 · a second rider fills the car ══════════'
select set_config('t.sam', req('c0000000-0000-4000-8000-000000000003'::uuid, 77.55, 77.68, 2)::text, false);
select test_as('c0000000-0000-4000-8000-000000000001');
select chk('a two-seat request is accepted', public.accept_ride_request(current_setting('t.sam')::uuid), true);
select chk('two seats charged at the seat price',
  (select fare from public.rides where rider_id='c0000000-0000-4000-8000-000000000003'), 180::numeric);
select chk('the published ride is now full',
  (select available_seats from public.published_rides where id='cbbb0000-0000-4000-8000-000000000001'), 0);

\echo '══════════ C · the stops come out in travel order ══════════'
-- Riya boards at 77.52 and leaves at 77.62; Sam boards at 77.55, leaves at 77.68.
-- Driving east, that is: Riya on, Sam on, Riya off, Sam off.
select chk('the schedule is ordered along the route',
  (select string_agg(u.name || ' ' || s.kind, ' → ' order by s.seq)
     from public.trip_stops s
     join public.rides r on r.id = s.ride_id
     join public.users u on u.id = r.rider_id
    where s.trip_id = (select id from public.trips
                        where published_ride_id='cbbb0000-0000-4000-8000-000000000001')),
  'Riya Rider pickup → Sam Rider pickup → Riya Rider drop → Sam Rider drop');

\echo ''
\echo '══════════ D · departing and boarding ══════════'
select test_as('c0000000-0000-4000-8000-000000000001');
select chk('the trip departs', status, 'active') from public.start_carpool_trip('cbbb0000-0000-4000-8000-000000000001');
select chk('both seats are waiting to board',
  (select count(*) from public.rides r
    where r.published_ride_id='cbbb0000-0000-4000-8000-000000000001' and r.status='arrived'), 2::bigint);

select set_config('t.riyaride',
  (select ride_id::text from public.ride_requests where id=current_setting('t.riya')::uuid), false);
select chk('the rider boards with their own code',
  (select ok from public.start_ride(current_setting('t.riyaride')::uuid,
     (select otp from public.ride_otps where ride_id=current_setting('t.riyaride')::uuid), 1::smallint)), true);

\echo ''
\echo '   a headcount cannot exceed the seats that were paid for:'
select set_config('t.samride',
  (select ride_id::text from public.ride_requests where id=current_setting('t.sam')::uuid), false);
-- Three people at the door of a two-seat booking, in a car already carrying
-- one. This used to raise trips_seats_sane in the driver's face.
select ok from public.start_ride(current_setting('t.samride')::uuid,
  (select otp from public.ride_otps where ride_id=current_setting('t.samride')::uuid), 3::smallint);
select chk('the count is clamped to the two seats bought',
  (select seats_occupied from public.rides where id=current_setting('t.samride')::uuid), 2::smallint);
select chk('sam still owes the advertised 180',
  (select fare from public.rides where id=current_setting('t.samride')::uuid), 180::numeric);
select chk('and the car is not oversold',
  (select public.trip_seats_committed(id) <= seat_capacity from public.trips
    where published_ride_id='cbbb0000-0000-4000-8000-000000000001'), true);

\echo ''
\echo '══════════ E · completing pays out and receipts ══════════'
select id from public.complete_ride(current_setting('t.riyaride')::uuid);
select chk('the ride is completed',
  (select status from public.rides where id=current_setting('t.riyaride')::uuid), 'completed');
select chk('a payment was raised at the agreed price',
  (select amount from public.payments where ride_id=current_setting('t.riyaride')::uuid), 90::numeric);

\echo ''
\echo '══════════ F · releasing a seat gives it back ══════════'
-- Sam is aboard, so the driver cannot simply strike them off a list.
select test_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.remove_carpool_rider('cbbb0000-0000-4000-8000-000000000001',
                                      'c0000000-0000-4000-8000-000000000003');
  perform chk('a rider already aboard cannot be removed', false, true);
exception when others then perform chk('a rider already aboard cannot be removed', true, true);
end $$;

-- A fresh publication, to release a seat that has not yet travelled.
insert into public.published_rides
  (id, driver_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
   available_seats, fare_per_seat, departure_time)
values ('cbbb0000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',
        12.97, 77.50, 12.97, 77.70, 'Origin', 'Destination', 2, 75, now() + interval '2 days');

select test_as('c0000000-0000-4000-8000-000000000004');
insert into public.ride_requests (id, published_ride_id, rider_id, seats_requested,
                                  pickup_lat, pickup_lng, drop_lat, drop_lng)
values ('cccc0000-0000-4000-8000-000000000001','cbbb0000-0000-4000-8000-000000000002',
        'c0000000-0000-4000-8000-000000000004', 1, 12.97, 77.52, 12.97, 77.62);
select test_as('c0000000-0000-4000-8000-000000000001');
select chk('the second publication takes a rider',
  public.accept_ride_request('cccc0000-0000-4000-8000-000000000001'), true);

select test_as('c0000000-0000-4000-8000-000000000004');
select chk('the rider releases their own seat',
  public.cancel_carpool_seat('cccc0000-0000-4000-8000-000000000001'), true);
select chk('the seat is back on the published ride',
  (select available_seats from public.published_rides where id='cbbb0000-0000-4000-8000-000000000002'), 2);
select chk('their booking is cancelled',
  (select status from public.rides where id=(select ride_id from public.ride_requests
    where id='cccc0000-0000-4000-8000-000000000001')), 'cancelled');
select chk('and their stops are off the schedule',
  (select count(*) from public.trip_stops s
    where s.ride_id = (select ride_id from public.ride_requests
                        where id='cccc0000-0000-4000-8000-000000000001')), 0::bigint);

\echo ''
\echo '   and a confirmed seat cannot be "declined" out from under the rider:'
select test_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.reject_ride_request(current_setting('t.sam')::uuid);
  perform chk('rejecting an accepted request is refused', false, true);
exception when others then perform chk('rejecting an accepted request is refused', true, true);
end $$;
select chk('their booking is untouched',
  (select status from public.rides where id=current_setting('t.samride')::uuid), 'ongoing');

\echo ''
\echo '══════════ G · who else is in the car stays private ══════════'
select test_as('c0000000-0000-4000-8000-000000000002');
set role authenticated;
select chk('a rider still sees the route they bought into',
  (select count(*) from public.published_rides where id='cbbb0000-0000-4000-8000-000000000001'), 1::bigint);
reset role;

-- Far Rider was refused a seat, so they hold none. They are exactly the
-- attacker the old `using (true)` handed the whole table to.
select test_as('c0000000-0000-4000-8000-000000000004');
set role authenticated;
select chk('a stranger cannot read the published ride directly',
  (select count(*) from public.published_rides where id='cbbb0000-0000-4000-8000-000000000001'), 0::bigint);
reset role;

\echo ''
\echo '   and search returns occupancy, not identities:'
select test_as('c0000000-0000-4000-8000-000000000004');
select chk('search still finds a ride with seats',
  (select count(*) from public.search_published_rides(12.97, 77.50, 1)
    where id='cbbb0000-0000-4000-8000-000000000002'), 1::bigint);
select chk('it says how many are aboard',
  (select riders_aboard from public.search_published_rides(12.97, 77.50, 1)
    where id='cbbb0000-0000-4000-8000-000000000002'), 0);
do $$ begin
  perform accepted_riders from public.search_published_rides(12.97, 77.50, 1);
  perform chk('search no longer returns the rider list at all', false, true);
exception when others then perform chk('search no longer returns the rider list at all', true, true);
end $$;

\echo ''
select expect(42);
