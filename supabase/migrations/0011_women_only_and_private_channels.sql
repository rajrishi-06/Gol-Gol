-- ============================================================================
-- Gol·Gol — women-only pooling, and locking down the live-location channel
--
-- Two things, both about who is allowed near whom:
--
--   §9  Women-only pooling, enforced in the candidate query rather than
--       filtered in the client — the design was explicit that a client-side
--       filter is not a safety feature, it is a suggestion.
--
--   The driver's GPS broadcast has been an open channel since the beginning.
--   The original audit flagged it and the code comment admitted it: anyone who
--       learns a ride's UUID can subscribe to that driver's live position.
-- ============================================================================

-- ###########################################################################
-- 1. GENDER, HELD WHERE IT CANNOT LEAK
--
-- Not a column on `users`. Postgres RLS is row-level, and `users` rows are
-- readable by ride counterparties — so a column there would hand every driver
-- and co-passenger the gender of everyone they ride with. A separate table
-- readable only by its owner keeps it out of every projection by construction,
-- and the matching functions read it as SECURITY DEFINER.
-- ###########################################################################

create table if not exists public.user_safety_prefs (
  user_id            uuid primary key references public.users (id) on delete cascade,
  -- Self-declared and optional. `null` is a first-class answer, not a gap to
  -- be filled: nobody is required to state this to use the app.
  gender             text check (gender in ('female','male','other')),
  women_only_default boolean not null default false,
  updated_at         timestamptz not null default now()
);

alter table public.user_safety_prefs enable row level security;

drop policy if exists safety_prefs_own on public.user_safety_prefs;
create policy safety_prefs_own on public.user_safety_prefs for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Deliberately no admin read policy. An operator has no reason to browse this,
-- and the surest way to keep something from leaking is for nothing to be able
-- to read it.

grant select, insert, update on public.user_safety_prefs to authenticated;

create or replace function public.set_safety_prefs(
  p_gender text default null, p_women_only_default boolean default null
) returns public.user_safety_prefs language plpgsql security definer set search_path = public as $$
declare v_row public.user_safety_prefs;
begin
  insert into public.user_safety_prefs (user_id, gender, women_only_default)
  values (auth.uid(), p_gender, coalesce(p_women_only_default, false))
  on conflict (user_id) do update
    set gender             = coalesce(p_gender, public.user_safety_prefs.gender),
        women_only_default = coalesce(p_women_only_default, public.user_safety_prefs.women_only_default),
        updated_at         = now()
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.set_safety_prefs(text, boolean) to authenticated;

create or replace function public.my_safety_prefs()
returns public.user_safety_prefs language sql stable security definer set search_path = public as $$
  select * from public.user_safety_prefs where user_id = auth.uid();
$$;
grant execute on function public.my_safety_prefs() to authenticated;

-- ###########################################################################
-- 2. THE PREFERENCE ON A BOOKING
-- ###########################################################################

alter table public.rides add column if not exists women_only boolean not null default false;

create index if not exists idx_rides_women_only on public.rides (status, women_only)
  where status = 'pending' and women_only;

-- A booking may only ask for it if the rider is a woman. Otherwise the flag is
-- a way to filter *other people* by gender, which is the opposite of a safety
-- feature. Silently corrected rather than raised: the client should not be able
-- to tell whether it guessed someone's gender right.
create or replace function public.rides_guard_women_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.women_only then
    if not exists (
      select 1 from public.user_safety_prefs p
       where p.user_id = new.rider_id and p.gender = 'female'
    ) then
      new.women_only := false;
    end if;
  elsif tg_op = 'INSERT' then
    -- honour the standing preference without the client having to send it
    select coalesce(p.women_only_default and p.gender = 'female', false)
      into new.women_only
      from public.user_safety_prefs p where p.user_id = new.rider_id;
    new.women_only := coalesce(new.women_only, false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rides_women_only on public.rides;
create trigger trg_rides_women_only before insert or update of women_only on public.rides
  for each row execute function public.rides_guard_women_only();

-- ###########################################################################
-- 3. ENFORCEMENT — SYMMETRIC, AND IN THE QUERY
--
-- The rule is not "women-only riders travel together". It is: for any two
-- people sharing a vehicle, if *either* asked for women-only, both must be
-- women. A rider who did not ask is still bound by the request of the rider
-- already aboard — otherwise the preference protects nobody.
-- ###########################################################################

create or replace function public.is_female(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_safety_prefs p
                  where p.user_id = p_user and p.gender = 'female');
$$;

/**
 * May this booking share the vehicle with everyone already on this trip?
 *
 * True when nothing about gender is being asked either way, which is the
 * ordinary case and costs one index lookup.
 */
create or replace function public.trip_admits_rider(p_trip_id uuid, p_ride_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_new public.rides; v_trip_women_only boolean; v_all_female boolean;
begin
  select * into v_new from public.rides where id = p_ride_id;
  if v_new.id is null then return false; end if;

  select bool_or(r.women_only), bool_and(public.is_female(r.rider_id))
    into v_trip_women_only, v_all_female
    from public.rides r
   where r.trip_id = p_trip_id
     and r.status in ('accepted','arrived','ongoing');

  -- nobody aboard: nothing to be incompatible with
  if v_all_female is null then return true; end if;

  -- someone aboard asked for women-only → the newcomer must be a woman
  if coalesce(v_trip_women_only, false) and not public.is_female(v_new.rider_id) then
    return false;
  end if;

  -- the newcomer asked for it → everyone aboard must be a woman
  if v_new.women_only and not coalesce(v_all_female, false) then
    return false;
  end if;

  return true;
end;
$$;
grant execute on function public.trip_admits_rider(uuid, uuid) to authenticated;

-- ###########################################################################
-- 4. IN THE FUNNEL, NOT THE CLIENT
--
-- §9 was explicit that this has to live in the candidate query. A client-side
-- filter shows the rider a shorter list; it does not stop the server offering
-- their ride to anyone.
-- ###########################################################################

drop function if exists public.poolable_rides(integer);
create or replace function public.poolable_rides(p_limit integer default 5)
returns table (
  ride_id        uuid,
  rider_name     text,
  from_address   text,
  to_address     text,
  from_lat       double precision,
  from_lng       double precision,
  to_lat         double precision,
  to_lng         double precision,
  seats          smallint,
  fare           numeric,
  distance_km    numeric,
  pickup_offset_km numeric,
  drop_offset_km   numeric,
  added_km       numeric,
  added_minutes  integer,
  pickup_eta_min integer,
  match_score    numeric,
  women_only     boolean,
  held_until     timestamptz,
  created_at     timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_trip  public.trips;
  cfg     public.pool_config;
  path    record;
  free    smallint;
  path_km double precision;
begin
  perform public.expire_seat_holds();

  select t.* into v_trip from public.trips t
   where t.driver_id = auth.uid() and t.status = 'active';
  if v_trip.id is null then return; end if;

  select * into cfg from public.pool_config where id;

  if not exists (
    select 1 from public.vehicle_classes vc
     where vc.id = v_trip.vehicle_class and vc.allows_concurrent_pool
  ) or not v_trip.pooling_enabled then
    return;
  end if;

  if exists (
    select 1 from public.rides r
     where r.trip_id = v_trip.id
       and r.status in ('accepted','arrived','ongoing')
       and not r.shareable
  ) then
    return;
  end if;

  free := public.trip_seats_available(v_trip.id);
  if free <= 0 then return; end if;

  select * into path from public.trip_remaining_path(v_trip.id);
  if coalesce(array_length(path.lats, 1), 0) < 2 then return; end if;
  path_km := public.path_length_km(path.lats, path.lngs);

  return query
  with cand as (
    select r.*,
           (select pl.offset_km from public.path_locate(path.lats, path.lngs, r.from_lat, r.from_lng) pl) as p_off,
           (select pl.offset_km from public.path_locate(path.lats, path.lngs, r.to_lat,   r.to_lng)   pl) as d_off,
           public.stop_progress(path.lats, path.lngs, r.from_lat, r.from_lng) as p_prog,
           public.stop_progress(path.lats, path.lngs, r.to_lat,   r.to_lng)   as d_prog,
           (select h.expires_at from public.seat_holds h
             where h.ride_id = r.id and h.driver_id = auth.uid() and h.expires_at > now()) as mine_until
      from public.rides r
     where r.status = 'pending'
       and r.shareable
       and r.driver_id is null
       and r.trip_id is null
       and r.rider_id <> auth.uid()
       and r.vehicle_type = v_trip.vehicle_class
       and r.seats <= free + coalesce((select h.seats from public.seat_holds h
                                        where h.ride_id = r.id and h.driver_id = auth.uid()
                                          and h.expires_at > now()), 0)
       and coalesce(r.scheduled_for, now()) <= now() + interval '2 minutes'
       -- women-only, both directions
       and public.trip_admits_rider(v_trip.id, r.id)
       and not exists (
         select 1 from public.seat_holds h
          where h.ride_id = r.id and h.driver_id <> auth.uid() and h.expires_at > now()
       )
       and not exists (
         select 1 from public.match_blocklist b
          join public.rides aboard on aboard.trip_id = v_trip.id
                                  and aboard.status in ('accepted','arrived','ongoing')
         where (b.user_id = r.rider_id and b.blocked_id in (aboard.rider_id, v_trip.driver_id))
            or (b.blocked_id = r.rider_id and b.user_id in (aboard.rider_id, v_trip.driver_id))
       )
  ), scored as (
    select c.*,
           public.path_added_km(path.lats, path.lngs, c.from_lat, c.from_lng, c.to_lat, c.to_lng) as add_km
      from cand c
     where c.p_off <= cfg.corridor_km
       and (c.d_off <= cfg.corridor_km or c.d_prog - path_km <= cfg.max_extension_km)
       and c.d_prog > c.p_prog
  ), ranked as (
    select s.*,
           s.add_km * cfg.road_factor / cfg.avg_speed_kmh * 60 as added_min,
           s.p_prog * cfg.road_factor / cfg.avg_speed_kmh * 60 as wait_min
      from scored s
  )
  select r.id, u.name, r.from_address, r.to_address,
         r.from_lat, r.from_lng, r.to_lat, r.to_lng,
         r.seats, r.fare, r.distance_km,
         round(r.p_off::numeric, 2), round(r.d_off::numeric, 2),
         round(r.add_km::numeric, 2),
         ceil(r.added_min)::integer,
         ceil(r.wait_min)::integer,
         round(public.pool_score(
           greatest(0, r.distance_km::double precision - r.add_km),
           r.distance_km::double precision,
           r.added_min, r.wait_min, r.fare, greatest(1, r.added_min), r.wait_min
         )::numeric, 3),
         r.women_only,
         r.mine_until,
         r.created_at
    from ranked r
    join public.users u on u.id = r.rider_id
   where r.added_min <= cfg.max_detour_min
     and r.wait_min  <= cfg.max_pickup_wait_min
   order by public.pool_score(
              greatest(0, r.distance_km::double precision - r.add_km),
              r.distance_km::double precision,
              r.added_min, r.wait_min, r.fare, greatest(1, r.added_min), r.wait_min
            ) desc
   limit greatest(1, p_limit);
end;
$$;
grant execute on function public.poolable_rides(integer) to authenticated;

-- The accept path re-checks it under the lock, like every other gate: the
-- offer was priced from a read, and someone else may have boarded since.
create or replace function public.assert_women_only_ok(p_trip_id uuid, p_ride_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.trip_admits_rider(p_trip_id, p_ride_id) then
    raise exception 'this ride is women-only' using errcode = '42501';
  end if;
end;
$$;

-- Patch it into the two accept paths without restating them.
do $$
declare src text;
begin
  -- accept_pooled_ride: after the shareable-consent check, before seats
  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'accept_pooled_ride' and pronamespace = 'public'::regnamespace;
  src := replace(src,
    '  -- Another driver''s live hold outranks us even if a seat looks free.',
    '  perform public.assert_women_only_ok(v_trip.id, p_ride_id);

  -- Another driver''s live hold outranks us even if a seat looks free.');
  execute src;
end $$;

-- Batch matching honours it too, or the window becomes a way around the rule.
do $$
declare src text;
begin
  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'run_batch_match' and pronamespace = 'public'::regnamespace;
  src := replace(src,
    '    continue when pair.p_off > cfg.corridor_km;',
    '    continue when pair.p_off > cfg.corridor_km;
    continue when not public.trip_admits_rider(pair.tid, pair.rid);');
  execute src;
end $$;

-- ###########################################################################
-- 5. THE LIVE-LOCATION CHANNEL IS NO LONGER OPEN
--
-- `publishRideLocation` has broadcast the driver's GPS on `ride:<uuid>` since
-- the beginning, on a public channel. The original audit called it out and the
-- code comment agreed with it: anyone who learned a ride's UUID could subscribe
-- and watch that driver move. Ride UUIDs are not secret — they are in URLs, in
-- share links, in notification payloads.
--
-- Supabase Realtime Authorization puts RLS in front of the channel: a client
-- joining with `private: true` is checked against policies on
-- `realtime.messages`, keyed by topic.
--
-- Guarded, because the `realtime` schema only exists on a Supabase project.
-- Running this against a stock Postgres — which is how the test suite proves
-- the migrations apply — should be a no-op, not a failure.
-- ###########################################################################

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'realtime') then
    raise notice 'no realtime schema — skipping channel authorization (expected outside Supabase)';
    return;
  end if;

  -- Topics are `ride-location:<uuid>` and `ride-chat:<uuid>:<suffix>` — the
  -- chat channel appends a random suffix so several tabs can subscribe, so the
  -- id is taken by position rather than by trimming a fixed prefix.

  -- Who may listen to a driver's position: the rider on that ride, and the
  -- driver themselves.
  execute $p$ drop policy if exists ride_location_read on realtime.messages $p$;
  execute $p$
    create policy ride_location_read on realtime.messages
    for select to authenticated
    using (
      realtime.topic() like 'ride-location:%'
      and exists (
        select 1 from public.rides r
         where r.id::text = split_part(realtime.topic(), ':', 2)
           and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
      )
    );
  $p$;

  -- Who may publish one: only the driver actually assigned, and only while the
  -- ride is live. Otherwise a rider could broadcast a fake position on their
  -- own ride's topic, which is worse than the leak this replaces.
  execute $p$ drop policy if exists ride_location_write on realtime.messages $p$;
  execute $p$
    create policy ride_location_write on realtime.messages
    for insert to authenticated
    with check (
      realtime.topic() like 'ride-location:%'
      and exists (
        select 1 from public.rides r
         where r.id::text = split_part(realtime.topic(), ':', 2)
           and r.driver_id = auth.uid()
           and r.status in ('accepted','arrived','ongoing')
      )
    );
  $p$;

  -- Chat and typing presence: both parties, both directions.
  execute $p$ drop policy if exists ride_chat_rw on realtime.messages $p$;
  execute $p$
    create policy ride_chat_rw on realtime.messages
    for all to authenticated
    using (
      realtime.topic() like 'ride-chat:%'
      and exists (
        select 1 from public.rides r
         where r.id::text = split_part(realtime.topic(), ':', 2)
           and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
      )
    )
    with check (
      realtime.topic() like 'ride-chat:%'
      and exists (
        select 1 from public.rides r
         where r.id::text = split_part(realtime.topic(), ':', 2)
           and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
      )
    );
  $p$;

  -- Presence says who is on a ride and when they are looking at it, which is
  -- the same class of information the location channel used to hand out.
  execute $p$ drop policy if exists ride_presence_rw on realtime.messages $p$;
  execute $p$
    create policy ride_presence_rw on realtime.messages
    for all to authenticated
    using (
      realtime.topic() like 'ride-presence:%'
      and exists (
        select 1 from public.rides r
         where r.id::text = split_part(realtime.topic(), ':', 2)
           and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
      )
    )
    with check (
      realtime.topic() like 'ride-presence:%'
      and exists (
        select 1 from public.rides r
         where r.id::text = split_part(realtime.topic(), ':', 2)
           and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
      )
    );
  $p$;

  raise notice 'realtime channel authorization installed';
end $$;
