\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- ============================================================================
-- Row-level security, exercised as a real role.
--
-- Every other file in this suite runs as `postgres`, which bypasses RLS
-- entirely — so a policy check from there passes no matter what the policy
-- says. Eleven migrations of security policy had been reviewed and never once
-- executed. This file drops to `authenticated`, sets a JWT subject, and asks
-- the questions an attacker would.
-- ============================================================================

insert into auth.users (id, phone, raw_user_meta_data) values
  ('70000000-0000-4000-8000-000000000001','+919600000001','{"name":"Driver A"}'),
  ('70000000-0000-4000-8000-000000000002','+919600000002','{"name":"Rider A"}'),
  ('70000000-0000-4000-8000-000000000003','+919600000003','{"name":"Nosy Stranger"}'),
  ('70000000-0000-4000-8000-000000000004','+919600000004','{"name":"Driver B"}'),
  ('70000000-0000-4000-8000-000000000005','+919600000005','{"name":"Rider B"}'),
  ('70000000-0000-4000-8000-00000000000a','+919600000099','{"name":"Admin"}');
update public.users set is_admin=true where id='70000000-0000-4000-8000-00000000000a';

insert into public.drivers (user_id, vehicle_type, vehicle_class, license_number, document_path)
values ('70000000-0000-4000-8000-000000000001','auto','auto','TS-SECRET-0001','70000000-0000-4000-8000-000000000001/licence.jpg'),
       ('70000000-0000-4000-8000-000000000004','auto','auto','TS-SECRET-0004','70000000-0000-4000-8000-000000000004/licence.jpg');
insert into public.active_drivers (user_id, is_online, current_lat, current_lng, heartbeat_at)
values ('70000000-0000-4000-8000-000000000001', true, 12.97, 77.50, now()),
       ('70000000-0000-4000-8000-000000000004', true, 12.97, 77.50, now());
select test_as('70000000-0000-4000-8000-00000000000a');
select public.set_driver_verification('70000000-0000-4000-8000-000000000001','approved');
select public.set_driver_verification('70000000-0000-4000-8000-000000000004','approved');

-- A ride that runs all the way to payment. `payments` only ever gets a row on
-- completion, so without this the "cannot read the payment" assertion below
-- would pass against an empty table and prove nothing about the policy.
select test_as('70000000-0000-4000-8000-000000000005');
insert into public.rides (id, rider_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
                          vehicle_type)
values ('7ade0000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000005',
        12.97, 77.50, 12.97, 77.60, 'B pickup', 'B drop', 'auto');
select test_as('70000000-0000-4000-8000-000000000004');
select public.accept_ride('7ade0000-0000-4000-8000-000000000002');
select ok from public.start_ride('7ade0000-0000-4000-8000-000000000002',
  (select otp from public.ride_otps where ride_id='7ade0000-0000-4000-8000-000000000002'), 1::smallint);
select id from public.complete_ride('7ade0000-0000-4000-8000-000000000002');

select test_as('70000000-0000-4000-8000-000000000002');
insert into public.rides (id, rider_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
                          vehicle_type, shareable)
values ('7ade0000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',
        12.97, 77.50, 12.97, 77.60, 'Private pickup', 'Private drop', 'auto', true);
select test_as('70000000-0000-4000-8000-000000000001');
select public.accept_ride('7ade0000-0000-4000-8000-000000000001');
select ok from public.start_ride('7ade0000-0000-4000-8000-000000000001',
  (select otp from public.ride_otps where ride_id='7ade0000-0000-4000-8000-000000000001'), 1::smallint);

\set QUIET off
\echo ''
\echo '   first, a control: as owner (RLS off) every one of these rows exists,'
\echo '   so the zeroes below are RLS hiding them and not an empty table'
select chk('control — the ride exists',
  (select count(*) from public.rides where id='7ade0000-0000-4000-8000-000000000001'), 1::bigint);
select chk('control — the licence number exists',
  (select count(*) from public.drivers where license_number = 'TS-SECRET-0001'), 1::bigint);
select chk('control — the live position exists',
  (select count(*) from public.active_drivers
    where user_id = '70000000-0000-4000-8000-000000000001'), 1::bigint);
select chk('control — the start OTP exists',
  (select count(*) from public.ride_otps where ride_id='7ade0000-0000-4000-8000-000000000001'), 1::bigint);
select chk('control — the trip exists',
  (select count(*) from public.trips where driver_id='70000000-0000-4000-8000-000000000001'), 1::bigint);
select chk('control — the stop sequence exists',
  (select count(*) from public.trip_stops where ride_id='7ade0000-0000-4000-8000-000000000001'), 2::bigint);
select chk('control — the payment exists',
  (select count(*) from public.payments where ride_id='7ade0000-0000-4000-8000-000000000002'), 1::bigint);
select chk('control — the mode row exists',
  (select count(*) from public.user_modes where user_id='70000000-0000-4000-8000-000000000001'), 1::bigint);
select chk('control — the phone is stored as ten digits',
  (select count(*) from public.users where mobile = '9600000002'), 1::bigint);

\echo ''
\echo '══════ what a signed-in stranger can reach ══════'
select test_as('70000000-0000-4000-8000-000000000003');
set role authenticated;

select chk('cannot read a stranger''s ride',
  (select count(*) from public.rides where id='7ade0000-0000-4000-8000-000000000001'), 0::bigint);

select chk('cannot read a driver''s licence number',
  (select count(*) from public.drivers where license_number = 'TS-SECRET-0001'), 0::bigint);

select chk('cannot read a driver''s live position',
  (select count(*) from public.active_drivers
    where user_id = '70000000-0000-4000-8000-000000000001'), 0::bigint);

select chk('cannot read the start OTP',
  (select count(*) from public.ride_otps where ride_id='7ade0000-0000-4000-8000-000000000001'), 0::bigint);

select chk('cannot read the trip',
  (select count(*) from public.trips
    where driver_id='70000000-0000-4000-8000-000000000001'), 0::bigint);

select chk('cannot read its stop sequence',
  (select count(*) from public.trip_stops
    where ride_id='7ade0000-0000-4000-8000-000000000001'), 0::bigint);

select chk('cannot read the payment',
  (select count(*) from public.payments
    where ride_id='7ade0000-0000-4000-8000-000000000002'), 0::bigint);

select chk('cannot read someone else''s mode',
  (select count(*) from public.user_modes
    where user_id='70000000-0000-4000-8000-000000000001'), 0::bigint);

select chk('cannot enumerate users by phone',
  (select count(*) from public.users where mobile = '9600000002'), 0::bigint);

\echo ''
\echo '   ...and cannot write over anything either:'
do $$ begin
  update public.rides set fare = 1 where id='7ade0000-0000-4000-8000-000000000001';
  perform chk('cannot rewrite the fare', found, false);
exception when others then perform chk('cannot rewrite the fare', false, false);
end $$;

do $$ begin
  insert into public.user_safety_prefs (user_id, gender)
  values ('70000000-0000-4000-8000-000000000002', 'female');
    perform chk('cannot write someone else''s safety prefs', false, true);
exception when others then perform chk('cannot write someone else''s safety prefs', true, true);
end $$;

reset role;

\echo ''
\echo '══════ what the rider on the ride can reach ══════'
select test_as('70000000-0000-4000-8000-000000000002');
set role authenticated;

select chk('can read their own ride',
  (select count(*) from public.rides where id='7ade0000-0000-4000-8000-000000000001'), 1::bigint);
select chk('can read their driver''s live position',
  (select count(*) from public.active_drivers
    where user_id='70000000-0000-4000-8000-000000000001'), 1::bigint);
select chk('can read the trip they are on',
  (select count(*) from public.trips
    where driver_id='70000000-0000-4000-8000-000000000001'), 1::bigint);
select chk('can read their own stops',
  (select count(*) from public.trip_stops
    where ride_id='7ade0000-0000-4000-8000-000000000001'), 2::bigint);
reset role;

\echo ''
\echo '══════ and the driver ══════'
select test_as('70000000-0000-4000-8000-000000000001');
set role authenticated;
select chk('driver reads the ride they are carrying',
  (select count(*) from public.rides where id='7ade0000-0000-4000-8000-000000000001'), 1::bigint);
select chk('driver still cannot read the start OTP',
  (select count(*) from public.ride_otps where ride_id='7ade0000-0000-4000-8000-000000000001'), 0::bigint);
reset role;

\echo ''
\echo '══════ and a driver cannot be approved without a document ══════'
-- The form asked for one; the database never did. Tested through the admin RPC,
-- because a direct update is separately reverted by the self-approval trigger —
-- so a check here would pass without the constraint existing at all.
insert into public.drivers (user_id, vehicle_type, vehicle_class)
values ('70000000-0000-4000-8000-000000000003','auto','auto');
select test_as('70000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.set_driver_verification('70000000-0000-4000-8000-000000000003','approved');
  perform chk('approving a driver with no document is refused', false, true);
exception when others then perform chk('approving a driver with no document is refused', true, true);
end $$;
select chk('they are still pending',
  (select verification_status from public.drivers
    where user_id='70000000-0000-4000-8000-000000000003'), 'pending');

\echo ''
select expect(28);
