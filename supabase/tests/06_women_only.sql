\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

insert into auth.users (id, phone, raw_user_meta_data) values
  ('60000000-0000-4000-8000-000000000001','+919500000001','{"name":"Driver"}'),
  ('60000000-0000-4000-8000-000000000002','+919500000002','{"name":"Asha W"}'),
  ('60000000-0000-4000-8000-000000000003','+919500000003','{"name":"Bina W"}'),
  ('60000000-0000-4000-8000-000000000004','+919500000004','{"name":"Chandan M"}'),
  ('60000000-0000-4000-8000-000000000005','+919500000005','{"name":"Unstated"}'),
  ('60000000-0000-4000-8000-00000000000a','+919500000099','{"name":"Admin"}');
update public.users set is_admin=true where id='60000000-0000-4000-8000-00000000000a';
insert into public.drivers (user_id, vehicle_type, vehicle_class, document_path)
values ('60000000-0000-4000-8000-000000000001','auto','auto','60000000-0000-4000-8000-000000000001/licence.jpg');
insert into public.active_drivers (user_id, is_online, current_lat, current_lng, heartbeat_at)
values ('60000000-0000-4000-8000-000000000001', true, 12.97, 77.50, now());
select test_as('60000000-0000-4000-8000-00000000000a');
select public.set_driver_verification('60000000-0000-4000-8000-000000000001','approved');

-- self-declared, each by themselves
select test_as('60000000-0000-4000-8000-000000000002');
select public.set_safety_prefs('female', false);
select test_as('60000000-0000-4000-8000-000000000003');
select public.set_safety_prefs('female', false);
select test_as('60000000-0000-4000-8000-000000000004');
select public.set_safety_prefs('male', false);
-- 005 declares nothing at all

create or replace function bk(who uuid, flng numeric, tlng numeric, wo boolean default false)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform test_as(who);
  insert into public.rides (rider_id, from_lat, from_lng, to_lat, to_lng, from_address, to_address,
                            vehicle_type, shareable, women_only)
  values (who, 12.97, flng, 12.97, tlng, 'from '||flng, 'to '||tlng, 'auto', true, wo)
  returning id into v;
  return v;
end $$;
create or replace function otp_of(r uuid) returns text language sql as $$
  select otp from public.ride_otps where ride_id = r $$;

\set QUIET off
\echo ''
\echo '══════ A · only a woman can ask for women-only ══════'
select set_config('t.man', bk('60000000-0000-4000-8000-000000000004'::uuid, 77.52, 77.62, true)::text, false);
select chk('a man asking for it is silently cleared', women_only, false)
  from public.rides where id = current_setting('t.man')::uuid;
select set_config('t.none', bk('60000000-0000-4000-8000-000000000005'::uuid, 77.53, 77.63, true)::text, false);
select chk('so is someone who never said', women_only, false)
  from public.rides where id = current_setting('t.none')::uuid;
select set_config('t.asha', bk('60000000-0000-4000-8000-000000000002'::uuid, 77.50, 77.60, true)::text, false);
select chk('a woman asking for it keeps it', women_only, true)
  from public.rides where id = current_setting('t.asha')::uuid;

\echo ''
\echo '══════ B · the trip inherits the constraint ══════'
select test_as('60000000-0000-4000-8000-000000000001');
select chk('driver picks Asha up', status, 'accepted')
  from public.accept_ride(current_setting('t.asha')::uuid);
select ok from public.start_ride(current_setting('t.asha')::uuid, otp_of(current_setting('t.asha')::uuid), 1::smallint);

select chk('a man is not offered the seat',
  (select coalesce(bool_or(ride_id = current_setting('t.man')::uuid), false)
     from public.poolable_rides()), false);
select chk('nor is someone who never said',
  (select coalesce(bool_or(ride_id = current_setting('t.none')::uuid), false)
     from public.poolable_rides()), false);

select set_config('t.bina', bk('60000000-0000-4000-8000-000000000003'::uuid, 77.515, 77.605)::text, false);
select test_as('60000000-0000-4000-8000-000000000001');
select chk('another woman is offered it',
  (select bool_or(ride_id = current_setting('t.bina')::uuid) from public.poolable_rides()), true);

\echo ''
\echo '   and the server refuses it even asked directly:'
do $$ begin
  perform public.accept_pooled_ride(current_setting('t.man')::uuid);
    perform chk('a man was added to a women-only trip', false, true);
exception when others then perform chk('a man was added to a women-only trip', true, true);
end $$;

select chk('the woman can be added', status, 'accepted')
  from public.accept_pooled_ride(current_setting('t.bina')::uuid);

\echo ''
\echo '══════ C · it protects the person who did NOT ask, too ══════'
-- Chandan is carrying nobody; a woman asking for women-only must not be
-- matched onto his trip just because he has no preference of his own.
insert into auth.users (id, phone, raw_user_meta_data)
values ('60000000-0000-4000-8000-000000000006','+919500000006','{"name":"Driver Two"}');
insert into public.drivers (user_id, vehicle_type, vehicle_class, document_path)
values ('60000000-0000-4000-8000-000000000006','auto','auto','60000000-0000-4000-8000-000000000006/licence.jpg');
insert into public.active_drivers (user_id, is_online, current_lat, current_lng, heartbeat_at)
values ('60000000-0000-4000-8000-000000000006', true, 12.97, 77.50, now());
select test_as('60000000-0000-4000-8000-00000000000a');
select public.set_driver_verification('60000000-0000-4000-8000-000000000006','approved');

select test_as('60000000-0000-4000-8000-000000000006');
select status from public.accept_ride(current_setting('t.man')::uuid);
select ok from public.start_ride(current_setting('t.man')::uuid, otp_of(current_setting('t.man')::uuid), 1::smallint);

select set_config('t.asha2', bk('60000000-0000-4000-8000-000000000002'::uuid, 77.525, 77.625, true)::text, false);
select test_as('60000000-0000-4000-8000-000000000006');
select chk('a women-only booking is not offered a mixed trip',
  (select coalesce(bool_or(ride_id = current_setting('t.asha2')::uuid), false)
     from public.poolable_rides()), false);
do $$ begin
  perform public.accept_pooled_ride(current_setting('t.asha2')::uuid);
    perform chk('a women-only rider was pooled with a man', false, true);
exception when others then perform chk('a women-only rider was pooled with a man', true, true);
end $$;

\echo ''
\echo '══════ D · gender never leaves its owner ══════'
-- The rest of this suite runs as `postgres`, which bypasses RLS entirely, so a
-- policy check from here would pass no matter what the policy said. Drop to the
-- `authenticated` role to actually exercise it.
select test_as('60000000-0000-4000-8000-000000000004');
set role authenticated;
select chk('another user cannot read it',
  (select count(*) from public.user_safety_prefs where user_id = '60000000-0000-4000-8000-000000000002'),
  0::bigint);
select chk('but can read their own',
  (select count(*) from public.user_safety_prefs where user_id = auth.uid()),
  1::bigint);
reset role;
select chk('the pool context does not carry it',
  (select (jsonb_array_elements(coalesce(ctx->'co_passengers','[]'::jsonb)) ? 'gender')
     from (select public.ride_pool_context(current_setting('t.asha')::uuid) as ctx) q limit 1),
  null::boolean);

\echo ''
select expect(14);
