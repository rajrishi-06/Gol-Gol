\set ON_ERROR_STOP on
\pset pager off
\set QUIET on


insert into auth.users (id, phone, raw_user_meta_data) values
  ('f0000000-0000-4000-8000-000000000001','+919400000001','{"name":"Home Driver"}'),
  ('f0000000-0000-4000-8000-000000000002','+919400000002','{"name":"Rider One"}'),
  ('f0000000-0000-4000-8000-000000000003','+919400000003','{"name":"Rider Two"}'),
  ('f0000000-0000-4000-8000-00000000000a','+919400000099','{"name":"Admin"}');
update public.users set is_admin=true where id='f0000000-0000-4000-8000-00000000000a';
insert into public.drivers (user_id, vehicle_type, vehicle_class)
values ('f0000000-0000-4000-8000-000000000001','auto','auto');
insert into public.active_drivers (user_id, is_online, current_lat, current_lng, heartbeat_at)
values ('f0000000-0000-4000-8000-000000000001', true, 12.97, 77.50, now());
select test_as('f0000000-0000-4000-8000-00000000000a');
select public.set_driver_verification('f0000000-0000-4000-8000-000000000001','approved');

create or replace function bk(who uuid, flng numeric, tlng numeric, share boolean default true)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform test_as(who);
  insert into public.rides (rider_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
                            vehicle_type, shareable)
  values (who, 12.97, flng, 12.97, tlng, 'from '||flng, 'to '||tlng, 'auto', share)
  returning id into v;
  return v;
end $$;
create or replace function otp_of(r uuid) returns text language sql as $$
  select otp from public.ride_otps where ride_id = r $$;

\set QUIET off
\echo ''
\echo '══════ A · the score has five terms, and they pull the right way ══════'
select chk('more overlap scores higher',
  public.pool_score(9.0, 10.0, 2, 2, 100, 5, 2) > public.pool_score(3.0, 10.0, 2, 2, 100, 5, 2), true);
select chk('delaying the riders aboard scores lower',
  public.pool_score(9.0, 10.0, 8, 2, 100, 5, 2) < public.pool_score(9.0, 10.0, 1, 2, 100, 5, 2), true);
select chk('a longer wait for the new rider scores lower',
  public.pool_score(9.0, 10.0, 2, 2, 100, 5, 9) < public.pool_score(9.0, 10.0, 2, 2, 100, 5, 1), true);
select chk('a better earning rate scores higher',
  public.pool_score(9.0, 10.0, 2, 2, 300, 5, 2) > public.pool_score(9.0, 10.0, 2, 2, 60, 5, 2), true);
\echo '   a city can be retuned without a deploy:'
insert into public.matching_weights (city, rider_delay) values ('bengaluru', 9.0);
update public.pool_config set city = 'bengaluru';
select chk('the city weight is what applies now',
  public.pool_score(9.0, 10.0, 8, 2, 100, 5, 2) < public.pool_score(9.0, 10.0, 8, 2, 100, 5, 2, 'default'), true);
update public.pool_config set city = 'default';

\echo ''
\echo '══════ B · a retried accept does not book twice ══════'
select set_config('t.a', bk('f0000000-0000-4000-8000-000000000002'::uuid, 77.50, 77.60)::text, false);
select test_as('f0000000-0000-4000-8000-000000000001');
select chk('first claim of the key is free', public.claim_accept_key('key-1', current_setting('t.a')::uuid), null::uuid);
select chk('the retry reports the original', public.claim_accept_key('key-1', current_setting('t.a')::uuid),
       current_setting('t.a')::uuid);

\echo ''
\echo '══════ C · an impossible stop order is refused, not tidied ══════'
select status from public.accept_ride(current_setting('t.a')::uuid);
do $$
declare v_trip uuid; p smallint; d smallint;
begin
  select id into v_trip from public.trips where driver_id='f0000000-0000-4000-8000-000000000001';
  select seq into p from public.trip_stops where trip_id=v_trip and kind='pickup';
  select seq into d from public.trip_stops where trip_id=v_trip and kind='drop';
  -- put the drop before the pickup, which no code path should ever produce
  update public.trip_stops set seq = p where trip_id=v_trip and kind='drop';
  update public.trip_stops set seq = d where trip_id=v_trip and kind='pickup';
  -- The trigger is deferred to commit, because trip_place_stops renumbers the
  -- whole sequence in one statement and legitimately passes through
  -- intermediate states. Force it here so the refusal lands inside this block
  -- rather than escaping to the outer transaction.
  set constraints public.trg_trip_stops_order immediate;
    perform chk('an impossible schedule was written', false, true);
exception when others then perform chk('an impossible schedule was written', true, true);
end $$;

\echo ''
\echo '══════ D · a pooled drop needs the rider''s code ══════'
select ok from public.start_ride(current_setting('t.a')::uuid, otp_of(current_setting('t.a')::uuid), 1::smallint);
select set_config('t.b', bk('f0000000-0000-4000-8000-000000000003'::uuid, 77.515, 77.605)::text, false);
select test_as('f0000000-0000-4000-8000-000000000001');
select chk('the second rider joins', status, 'accepted')
  from public.accept_pooled_ride(current_setting('t.b')::uuid);

select test_as('f0000000-0000-4000-8000-000000000002');
select chk('a pooled rider gets a drop code', length(public.issue_drop_otp(current_setting('t.a')::uuid)), 4);
select set_config('t.otp', public.issue_drop_otp(current_setting('t.a')::uuid), false);

select test_as('f0000000-0000-4000-8000-000000000001');
select chk('a wrong code is refused', public.verify_drop(current_setting('t.a')::uuid, '0000'),
       current_setting('t.otp') = '0000');
select chk('the right code verifies', public.verify_drop(current_setting('t.a')::uuid, current_setting('t.otp')), true);
select chk('and it is recorded', drop_verified, true) from public.rides where id=current_setting('t.a')::uuid;

\echo ''
\echo '══════ E · heading home is matched against the way home ══════'
select test_as('f0000000-0000-4000-8000-000000000001');
-- finish up so the driver is empty again
select final_fare > 0 from public.complete_ride(current_setting('t.a')::uuid);
select ok from public.start_ride(current_setting('t.b')::uuid, otp_of(current_setting('t.b')::uuid), 1::smallint);
select final_fare > 0 from public.complete_ride(current_setting('t.b')::uuid);

select public.set_user_mode('heading_home', 12.97, 77.70);
select chk('the mode took the destination', mode, 'heading_home') from public.user_modes
 where user_id='f0000000-0000-4000-8000-000000000001';

select set_config('t.home', bk('f0000000-0000-4000-8000-000000000002'::uuid, 77.53, 77.64)::text, false);
select set_config('t.away', bk('f0000000-0000-4000-8000-000000000003'::uuid, 13.06, 77.53)::text, false);
select test_as('f0000000-0000-4000-8000-000000000001');
select chk('a ride on the way home is offered', count(*), 1::bigint) from public.heading_home_rides();
select rider_name, detour_km, pickup_eta_min from public.heading_home_rides();

select public.accept_ride(current_setting('t.home')::uuid) is not null as accepted;
-- A scalar subquery, not a join: `select chk(...) from <join>` runs zero times
-- when the join is empty, which is how this assertion silently skipped.
select chk('accepting carries the destination onto the trip',
  (select round(t.destination_lng::numeric, 2) from public.trips t
    where t.driver_id = 'f0000000-0000-4000-8000-000000000001' and t.status = 'active'),
  77.70::numeric);

\echo ''
\echo '══════ F · batching is off unless you turn it on ══════'
select chk('nothing is queued while the window is zero', count(*), 0::bigint) from public.match_queue;
select chk('and the batch solver does nothing', count(*), 0::bigint) from public.run_batch_match();

update public.pool_config set batch_window_seconds = 1;
select set_config('t.q', bk('f0000000-0000-4000-8000-000000000003'::uuid, 77.52, 77.62)::text, false);
select chk('now a shareable request queues', count(*), 1::bigint)
  from public.match_queue where resolved_at is null;

\echo ''
\echo '══════ G · the metrics report something real ══════'
select chk('all six are reported', count(*), 6::bigint) from public.pooling_metrics(30);
select metric, value, unit from public.pooling_metrics(30);

\echo ''
select expect(20);
