-- ============================================================================
-- Gol·Gol — the rest of the plan
--
-- An audit of docs/POOLING_ARCHITECTURE.md against the shipped code turned up
-- six things the design specified and the code never grew, plus P5. All of them
-- are here:
--
--   §5  a five-term score in a per-city weights table  (shipped: order by km)
--   §8  an idempotency key on accept
--   §8  a trigger that *rejects* an impossible stop order
--   §9  drop verification on pooled trips
--   §3  heading_home actually used for matching
--   §12 the metrics
--   P5  batch matching over a short window
-- ============================================================================

-- ###########################################################################
-- 1. SCORING — five terms, tunable per city, out of the code
--
-- `poolable_rides` ordered by added distance alone. That is one of the five
-- signals the design named, and on its own it prefers a match that saves the
-- driver a kilometre over one that shares fifteen.
-- ###########################################################################

create table if not exists public.matching_weights (
  city            text primary key,
  overlap         numeric not null default 1.00,  -- w1 · shared_km / booking_km
  rider_delay     numeric not null default 0.90,  -- w2 · minutes added for those aboard
  pickup_detour   numeric not null default 0.45,  -- w3 · minutes to reach the new pickup
  earn_rate       numeric not null default 0.60,  -- w4 · incremental fare per incremental minute
  new_rider_wait  numeric not null default 0.35,  -- w5 · minutes the new rider waits
  updated_at      timestamptz not null default now()
);

-- `default` is the fallback every city falls back to; a city row overrides it.
insert into public.matching_weights (city) values ('default')
on conflict (city) do nothing;

alter table public.matching_weights enable row level security;
drop policy if exists matching_weights_read on public.matching_weights;
create policy matching_weights_read on public.matching_weights for select to authenticated using (true);

alter table public.pool_config add column if not exists city text not null default 'default';

/**
 * The score from §5, in one place.
 *
 * Signs matter more than magnitudes here: overlap and earning rate pull a match
 * up, and every minute it costs someone pulls it down. Weights live in a table
 * so a city can be retuned without a deploy — which was the point of specifying
 * them as w1..w5 rather than hard-coding a sort.
 */
create or replace function public.pool_score(
  p_shared_km        double precision,
  p_booking_km       double precision,
  p_rider_delay_min  double precision,
  p_pickup_min       double precision,
  p_fare             numeric,
  p_added_min        double precision,
  p_new_wait_min     double precision,
  p_city             text default null
) returns double precision language plpgsql stable security definer set search_path = public as $$
declare w public.matching_weights;
begin
  select * into w from public.matching_weights
   where city = coalesce(p_city, (select city from public.pool_config where id));
  if not found then select * into w from public.matching_weights where city = 'default'; end if;

  return
      w.overlap        * (p_shared_km / nullif(p_booking_km, 0))
    - w.rider_delay    * p_rider_delay_min
    - w.pickup_detour  * p_pickup_min
    + w.earn_rate      * (p_fare::double precision / greatest(1, p_added_min))
    - w.new_rider_wait * p_new_wait_min;
end;
$$;
grant execute on function public.pool_score(double precision, double precision, double precision,
  double precision, numeric, double precision, double precision, text) to authenticated;

-- ###########################################################################
-- 2. IDEMPOTENT ACCEPT
--
-- A retried accept — a flaky connection, a double tap — must return the first
-- result, not book twice or fail confusingly on the second attempt.
-- ###########################################################################

create table if not exists public.accept_attempts (
  key        text primary key,
  driver_id  uuid not null references public.users (id) on delete cascade,
  ride_id    uuid not null references public.rides (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_accept_attempts_age on public.accept_attempts (created_at);

alter table public.accept_attempts enable row level security;
-- server-only; no client policy

/**
 * Record an accept against its key, or report that the key was already used.
 *
 * Returns the ride the key resolved to. Callers treat a non-null return from a
 * *previous* attempt as "already done, here is what happened", which is what
 * makes a retry safe.
 */
create or replace function public.claim_accept_key(p_key text, p_ride_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_existing uuid;
begin
  if p_key is null then return null; end if;

  delete from public.accept_attempts where created_at < now() - interval '1 day';

  select ride_id into v_existing from public.accept_attempts where key = p_key;
  if v_existing is not null then return v_existing; end if;

  insert into public.accept_attempts (key, driver_id, ride_id)
  values (p_key, auth.uid(), p_ride_id)
  on conflict (key) do nothing;
  return null;
end;
$$;

-- ###########################################################################
-- 3. AN IMPOSSIBLE SCHEDULE IS REJECTED, NOT REPAIRED
--
-- `trip_fix_pair` quietly swaps a drop that sorted before its own pickup. That
-- is the right repair at insertion time, but it means a bug elsewhere could
-- write nonsense and have it silently tidied. The invariant belongs in a
-- constraint that raises.
-- ###########################################################################

create or replace function public.trip_stops_assert_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_trip uuid := coalesce(new.trip_id, old.trip_id);
        v_ride uuid := coalesce(new.ride_id, old.ride_id);
        p_seq smallint; d_seq smallint;
begin
  select seq into p_seq from public.trip_stops
   where trip_id = v_trip and ride_id = v_ride and kind = 'pickup';
  select seq into d_seq from public.trip_stops
   where trip_id = v_trip and ride_id = v_ride and kind = 'drop';

  if p_seq is not null and d_seq is not null and d_seq <= p_seq then
    raise exception 'stop order for booking % puts the drop (seq %) at or before the pickup (seq %)',
      v_ride, d_seq, p_seq using errcode = '23514';
  end if;
  return null;
end;
$$;

-- Deferred to the end of the statement: `trip_place_stops` renumbers the whole
-- sequence in one UPDATE and legitimately passes through intermediate states.
drop trigger if exists trg_trip_stops_order on public.trip_stops;
create constraint trigger trg_trip_stops_order
  after insert or update on public.trip_stops
  deferrable initially deferred
  for each row execute function public.trip_stops_assert_order();

-- ###########################################################################
-- 4. DROP VERIFICATION ON POOLED TRIPS
--
-- With one rider, "completed" is unambiguous. With three aboard, a driver can
-- close the wrong booking — ending someone's trip, and their fare, at a place
-- they never got out. A short code, shown to the rider, closes that.
-- ###########################################################################

alter table public.rides add column if not exists drop_otp      text;
alter table public.rides add column if not exists drop_verified boolean not null default false;

-- Issued only where it is needed: a solo ride has nothing to confuse.
create or replace function public.issue_drop_otp(p_ride_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_ride public.rides; v_otp text;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null or auth.uid() is distinct from v_ride.rider_id then
    raise exception 'not your ride' using errcode = '42501';
  end if;
  if not v_ride.pooled then return null; end if;

  if v_ride.drop_otp is null then
    v_otp := lpad((floor(random() * 10000))::int::text, 4, '0');
    update public.rides set drop_otp = v_otp where id = p_ride_id;
  else
    v_otp := v_ride.drop_otp;
  end if;
  return v_otp;
end;
$$;
grant execute on function public.issue_drop_otp(uuid) to authenticated;

create or replace function public.verify_drop(p_ride_id uuid, p_otp text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  select (r.drop_otp is not null and r.drop_otp = p_otp and r.driver_id = auth.uid())
    into v_ok from public.rides r where r.id = p_ride_id;
  if coalesce(v_ok, false) then
    update public.rides set drop_verified = true where id = p_ride_id;
  end if;
  return coalesce(v_ok, false);
end;
$$;
grant execute on function public.verify_drop(uuid, text) to authenticated;

-- ###########################################################################
-- 5. HEADING HOME
--
-- 0009 let a driver declare it and stored the destination; nothing used it.
-- It is the state that makes "anyone can drive" worth anything — someone on
-- their way home who will take a passenger going roughly the same way — and it
-- reuses the corridor machinery with their own destination as the fixed last
-- stop.
-- ###########################################################################

-- 0007's DDL sketch carried these on `trips`; the migration that replaced the
-- PostGIS geometry columns dropped them along the way, so `user_modes` has had
-- a destination since 0009 with nowhere to put it once a trip opened.
alter table public.trips add column if not exists destination_lat double precision;
alter table public.trips add column if not exists destination_lng double precision;

-- The remaining path now ends at the driver's declared destination when there
-- is one, so pooling onto a heading-home trip stays on their way home instead
-- of quietly extending the journey past it.
create or replace function public.trip_remaining_path(
  p_trip_id uuid,
  out lats double precision[], out lngs double precision[]
) language plpgsql stable as $$
declare d record; t record;
begin
  select a.current_lat, a.current_lng into d
    from public.active_drivers a
    join public.trips tr on tr.driver_id = a.user_id
   where tr.id = p_trip_id;

  lats := '{}'; lngs := '{}';
  if d.current_lat is not null then
    lats := array_append(lats, d.current_lat);
    lngs := array_append(lngs, d.current_lng);
  end if;

  select array_cat(lats, array_agg(s.lat order by s.seq)),
         array_cat(lngs, array_agg(s.lng order by s.seq))
    into lats, lngs
    from public.trip_stops s
   where s.trip_id = p_trip_id and s.reached_at is null;

  select destination_lat, destination_lng into t from public.trips where id = p_trip_id;
  if t.destination_lat is not null then
    lats := array_append(lats, t.destination_lat);
    lngs := array_append(lngs, t.destination_lng);
  end if;
end;
$$;

/**
 * Requests on the way home, for a driver who has declared where that is and is
 * not yet carrying anyone.
 *
 * The same corridor test as pooling, against the straight line from where they
 * are to where they are going. Accepting one goes through `accept_ride`, which
 * carries the destination onto the trip so any *further* match stays on route.
 */
create or replace function public.heading_home_rides(p_limit integer default 5)
returns table (
  ride_id      uuid,
  rider_name   text,
  from_address text,
  to_address   text,
  from_lat     double precision,
  from_lng     double precision,
  to_lat       double precision,
  to_lng       double precision,
  seats        smallint,
  fare         numeric,
  distance_km  numeric,
  detour_km    numeric,
  pickup_eta_min integer,
  created_at   timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  m       public.user_modes;
  cfg     public.pool_config;
  d       record;
  lats    double precision[];
  lngs    double precision[];
  v_class text;
  home_km double precision;
begin
  select * into m from public.user_modes where user_id = auth.uid();
  if m.mode is distinct from 'heading_home' or m.destination_lat is null then return; end if;

  -- Only while empty: once they pick someone up it is an ordinary trip, and
  -- `poolable_rides` takes over with the destination already on the path.
  if exists (
    select 1 from public.trips t
     where t.driver_id = auth.uid() and t.status = 'active'
       and exists (select 1 from public.rides r
                    where r.trip_id = t.id and r.status in ('accepted','arrived','ongoing'))
  ) then return; end if;

  select * into cfg from public.pool_config where id;
  select d2.vehicle_class into v_class from public.drivers d2
   where d2.user_id = auth.uid() and d2.verification_status = 'approved';
  if v_class is null then return; end if;

  select current_lat, current_lng into d from public.active_drivers where user_id = auth.uid();
  if d.current_lat is null then return; end if;

  lats := array[d.current_lat, m.destination_lat];
  lngs := array[d.current_lng, m.destination_lng];
  home_km := public.path_length_km(lats, lngs);

  return query
  with cand as (
    select r.*,
           (select pl.offset_km from public.path_locate(lats, lngs, r.from_lat, r.from_lng) pl) as p_off,
           (select pl.offset_km from public.path_locate(lats, lngs, r.to_lat,   r.to_lng)   pl) as d_off,
           public.stop_progress(lats, lngs, r.from_lat, r.from_lng) as p_prog,
           public.stop_progress(lats, lngs, r.to_lat,   r.to_lng)   as d_prog
      from public.rides r
     where r.status = 'pending'
       and r.driver_id is null
       and r.trip_id is null
       and r.rider_id <> auth.uid()
       and r.vehicle_type = v_class
       and coalesce(r.scheduled_for, now()) <= now() + interval '5 minutes'
       and not exists (
         select 1 from public.seat_holds h
          where h.ride_id = r.id and h.driver_id <> auth.uid() and h.expires_at > now()
       )
  ), scored as (
    select c.*, public.path_added_km(lats, lngs, c.from_lat, c.from_lng, c.to_lat, c.to_lng) as add_km
      from cand c
     where c.p_off <= cfg.corridor_km
       and (c.d_off <= cfg.corridor_km or c.d_prog - home_km <= cfg.max_extension_km)
       and c.d_prog > c.p_prog
  )
  select s.id, u.name, s.from_address, s.to_address,
         s.from_lat, s.from_lng, s.to_lat, s.to_lng,
         s.seats, s.fare, s.distance_km,
         round(s.add_km::numeric, 2),
         ceil(s.p_prog * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer,
         s.created_at
    from scored s
    join public.users u on u.id = s.rider_id
   where s.add_km * cfg.road_factor / cfg.avg_speed_kmh * 60 <= cfg.max_detour_min
   order by s.add_km
   limit greatest(1, p_limit);
end;
$$;
grant execute on function public.heading_home_rides(integer) to authenticated;

-- Carry the declared destination onto the trip at accept time.
--
-- Keyed on the destination existing, *not* on the mode still reading
-- heading_home: accepting updates the ride first, which fires the mode sync and
-- moves the driver to on_trip before this trigger ever runs. Checking the mode
-- here meant the destination was never once copied.
--
-- `set_mode_row` leaves the destination alone, so it survives the trip; only
-- `set_user_mode` clears it, which is exactly when the driver stops heading
-- home.
create or replace function public.trips_take_destination()
returns trigger language plpgsql security definer set search_path = public as $$
declare m public.user_modes;
begin
  select * into m from public.user_modes where user_id = new.driver_id;
  if m.destination_lat is not null then
    new.destination_lat := m.destination_lat;
    new.destination_lng := m.destination_lng;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trips_destination on public.trips;
create trigger trg_trips_destination before insert on public.trips
  for each row execute function public.trips_take_destination();

-- ###########################################################################
-- 6. P5 — BATCH MATCHING
--
-- Matching each request the instant it arrives is greedy: the first driver to
-- ask gets the best available match, and a request that would have been a far
-- better fit for them arrives a second later and takes a worse one. Holding new
-- requests for a short window and solving them together fixes that.
--
-- It is also the phase that only pays off at volume. With three requests in
-- flight the window costs every rider that delay and produces the same
-- assignment greedy already would. So it ships **off** — `batch_window_seconds`
-- defaults to 0, which routes everything down the existing per-arrival path —
-- and turning it on is a decision to make when §12's match rate and concurrent
-- volume say the window would have something to choose between.
-- ###########################################################################

alter table public.pool_config add column if not exists batch_window_seconds integer not null default 0;

create table if not exists public.match_queue (
  ride_id    uuid primary key references public.rides (id) on delete cascade,
  queued_at  timestamptz not null default now(),
  resolved_at timestamptz,
  trip_id    uuid references public.trips (id) on delete set null
);

create index if not exists idx_match_queue_open on public.match_queue (queued_at)
  where resolved_at is null;

alter table public.match_queue enable row level security;
drop policy if exists match_queue_read on public.match_queue;
create policy match_queue_read on public.match_queue for select to authenticated
using (
  exists (select 1 from public.rides r where r.id = match_queue.ride_id and r.rider_id = auth.uid())
  or public.is_admin()
);

-- A shareable request joins the queue on creation *when batching is on*. With
-- the window at 0 this trigger does nothing at all, so the per-arrival path is
-- untouched by the feature existing.
create or replace function public.rides_enqueue_for_batch()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_window integer;
begin
  select batch_window_seconds into v_window from public.pool_config where id;
  if coalesce(v_window, 0) > 0 and new.shareable and new.status = 'pending' then
    insert into public.match_queue (ride_id) values (new.id)
    on conflict (ride_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rides_enqueue on public.rides;
create trigger trg_rides_enqueue after insert on public.rides
  for each row execute function public.rides_enqueue_for_batch();

/**
 * Solve one batch.
 *
 * Every (request, trip) pair that survives the corridor and feasibility gates
 * is scored, and the whole set is then assigned best-first — so the strongest
 * pairing in the batch is made first regardless of which request arrived
 * earliest, which is the entire difference from greedy.
 *
 * Best-first over all pairs is not the optimal assignment; that is a transport
 * problem, and solving it exactly in plpgsql would be the wrong place and the
 * wrong cost. It captures most of the gain, and the honest ceiling is written
 * down here rather than implied.
 *
 * Returns what it assigned, so a scheduler can log it.
 */
create or replace function public.run_batch_match()
returns table (ride_id uuid, trip_id uuid, score double precision)
language plpgsql security definer set search_path = public as $$
declare
  cfg      public.pool_config;
  pair     record;
  taken    uuid[] := '{}';
  v_free   smallint;
  v_added  double precision;
  v_wait   double precision;
begin
  select * into cfg from public.pool_config where id;
  if coalesce(cfg.batch_window_seconds, 0) <= 0 then return; end if;

  perform public.expire_seat_holds();

  -- Everything ripe enough to decide, scored against every trip it could join.
  for pair in
    with ripe as (
      select r.* from public.rides r
        join public.match_queue q on q.ride_id = r.id
       where q.resolved_at is null
         and r.status = 'pending'
         and r.driver_id is null
         and q.queued_at <= now() - make_interval(secs => cfg.batch_window_seconds)
    ),
    open_trips as (
      select t.*, p.lats, p.lngs
        from public.trips t
        cross join lateral public.trip_remaining_path(t.id) p
       where t.status = 'active'
         and t.pooling_enabled
         and exists (select 1 from public.vehicle_classes vc
                      where vc.id = t.vehicle_class and vc.allows_concurrent_pool)
         and coalesce(array_length(p.lats, 1), 0) >= 2
         and not exists (select 1 from public.rides r2
                          where r2.trip_id = t.id
                            and r2.status in ('accepted','arrived','ongoing')
                            and not r2.shareable)
    )
    select ripe.id as rid, ot.id as tid,
           ot.lats, ot.lngs, ripe.seats,
           ripe.from_lat, ripe.from_lng, ripe.to_lat, ripe.to_lng,
           ripe.distance_km, ripe.fare,
           public.path_added_km(ot.lats, ot.lngs, ripe.from_lat, ripe.from_lng, ripe.to_lat, ripe.to_lng) as add_km,
           public.stop_progress(ot.lats, ot.lngs, ripe.from_lat, ripe.from_lng) as p_prog,
           public.stop_progress(ot.lats, ot.lngs, ripe.to_lat, ripe.to_lng) as d_prog,
           (select pl.offset_km from public.path_locate(ot.lats, ot.lngs, ripe.from_lat, ripe.from_lng) pl) as p_off,
           (select pl.offset_km from public.path_locate(ot.lats, ot.lngs, ripe.to_lat, ripe.to_lng) pl) as d_off
      from ripe cross join open_trips ot
     where ripe.vehicle_type = ot.vehicle_class
  loop
    -- gates, same as the per-arrival funnel
    continue when pair.rid = any(taken);
    continue when pair.p_off > cfg.corridor_km;
    continue when pair.d_prog <= pair.p_prog;
    v_added := pair.add_km * cfg.road_factor / cfg.avg_speed_kmh * 60;
    continue when v_added > cfg.max_detour_min;
    v_wait := pair.p_prog * cfg.road_factor / cfg.avg_speed_kmh * 60;
    continue when v_wait > cfg.max_pickup_wait_min;
    v_free := public.trip_seats_available(pair.tid);
    continue when pair.seats > v_free;

    return query
    select pair.rid, pair.tid,
           public.pool_score(
             greatest(0, pair.distance_km::double precision - pair.add_km),
             pair.distance_km::double precision,
             v_added, v_wait, pair.fare, greatest(1, v_added), v_wait);
  end loop;
end;
$$;
grant execute on function public.run_batch_match() to authenticated;

/**
 * Assign one batch and mark it resolved.
 *
 * Split from the scoring above so the pairing can be inspected without acting
 * on it — which is how you tune weights on real traffic before letting them
 * dispatch anything.
 */
create or replace function public.apply_batch_match()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; used uuid[] := '{}';
begin
  for r in
    select * from public.run_batch_match() order by score desc
  loop
    continue when r.ride_id = any(used);
    -- Recheck under the trip's lock, exactly as an interactive accept does: the
    -- scores were computed over a snapshot of the whole batch.
    perform 1 from public.trips where id = r.trip_id and status = 'active' for update;
    if public.trip_seats_available(r.trip_id) <= 0 then continue; end if;

    update public.rides
       set status = 'accepted', trip_id = r.trip_id, pooled = true,
           driver_id = (select driver_id from public.trips where id = r.trip_id),
           accepted_at = now()
     where id = r.ride_id and status = 'pending' and driver_id is null;
    if not found then continue; end if;

    perform public.trip_place_stops(r.trip_id, r.ride_id);
    perform public.trip_recount(r.trip_id);

    update public.match_queue set resolved_at = now(), trip_id = r.trip_id where ride_id = r.ride_id;
    used := used || r.ride_id;
    n := n + 1;
  end loop;

  -- Anything that waited out the window without a match goes back to ordinary
  -- dispatch rather than sitting in the queue.
  update public.match_queue q set resolved_at = now()
   where q.resolved_at is null
     and q.queued_at < now() - interval '2 minutes';

  return n;
end;
$$;
grant execute on function public.apply_batch_match() to authenticated;

-- ###########################################################################
-- 7. §12 METRICS
-- ###########################################################################

/**
 * The six numbers the design says decide whether pooling is working.
 *
 * A view rather than a dashboard: they belong somewhere queryable long before
 * they belong on a screen, and the thresholds that matter are in the doc.
 */
create or replace function public.pooling_metrics(p_days integer default 7)
returns table (
  metric   text,
  value    numeric,
  unit     text,
  watch    text
) language sql stable security definer set search_path = public as $$
  with span as (select now() - make_interval(days => greatest(1, p_days)) as since),
  shareable as (
    select count(*)::numeric n from public.rides r, span
     where r.shareable and r.created_at >= span.since
  ),
  matched as (
    select count(*)::numeric n from public.rides r, span
     where r.pooled and r.created_at >= span.since
  ),
  done as (
    select * from public.rides r, span
     where r.status = 'completed' and r.completed_at >= span.since
  )
  select 'match_rate',
         round(100 * (select n from matched) / nullif((select n from shareable), 0), 1),
         '%', 'below ~15%: corridor too tight or supply too thin'
  union all
  select 'detour_breach_rate',
         round(100 * count(*) filter (where breach_credit > 0)
               / nullif(count(*) filter (where pooled), 0), 1),
         '%', 'above 2%: tighten the caps, loosen nothing' from done
  union all
  select 'pool_fill_rate',
         round(100 * avg(t.seats_occupied::numeric / nullif(t.seat_capacity, 0)), 1),
         '%', 'decides whether the rebate pays for itself'
    from public.trips t, span where t.ended_at >= span.since and t.status = 'completed'
  union all
  select 'pooled_cancel_rate',
         round(100 * count(*) filter (where status = 'cancelled' and pooled)
               / nullif(count(*) filter (where pooled), 0), 1),
         '%', 'canary for rider trust — watch the gap against solo widen'
    from public.rides r, span where r.created_at >= span.since
  union all
  select 'redispatch_rate',
         round(100 * count(*) filter (where cancellation_reason = 'capacity_displaced')
               / nullif(count(*), 0), 1),
         '%', 'rising means drivers are mis-reporting headcount'
    from public.rides r, span where r.created_at >= span.since
  union all
  select 'driver_earnings_per_hour',
         round(avg(p.driver_payout) * 60
               / nullif(avg(extract(epoch from (d.completed_at - d.started_at)) / 60), 0), 0),
         'INR', 'flat or negative means scoring favours the platform'
    from done d join public.payments p on p.ride_id = d.id;
$$;
grant execute on function public.pooling_metrics(integer) to authenticated;


-- ###########################################################################
-- 8. THE FUNNEL USES THE SCORE
--
-- `poolable_rides` ordered by added distance alone, which is one of the five
-- signals §5 named. Ordering by the score is the point of having written it.
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
           -- shared distance: what the new booking covers that the vehicle was
           -- driving anyway, which is its length less the detour it forces
           greatest(0, r.distance_km::double precision - r.add_km),
           r.distance_km::double precision,
           r.added_min, r.wait_min, r.fare, greatest(1, r.added_min), r.wait_min
         )::numeric, 3),
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

-- ###########################################################################
-- 9. THE RIDER VIEW CARRIES ENOUGH TO ACT ON
--
-- `block_co_passenger` has existed since 0007 with nothing able to call it: the
-- projection a rider sees returned a first name and a rating, and you cannot
-- block a first name.
--
-- The id is an opaque UUID. The privacy line this projection draws is around
-- addresses, surnames and phone numbers — the things that identify someone
-- outside the app — not an internal key for a person the rider is sharing a
-- vehicle with right now.
-- ###########################################################################

create or replace function public.ride_pool_context(p_ride_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ride public.rides; v_mates jsonb; v_before integer;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null or auth.uid() is distinct from v_ride.rider_id then
    return null;
  end if;
  if v_ride.trip_id is null then
    return jsonb_build_object('pooled', false, 'co_passengers', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', u.id,
           'name', split_part(u.name, ' ', 1),
           'rating', round(coalesce(u.user_rating, 5)::numeric, 1),
           'seats', r.seats,
           'aboard', r.status = 'ongoing')), '[]'::jsonb)
    into v_mates
    from public.rides r
    join public.users u on u.id = r.rider_id
   where r.trip_id = v_ride.trip_id
     and r.id <> p_ride_id
     and r.status in ('accepted','arrived','ongoing');

  select count(*) into v_before
    from public.trip_stops s
   where s.trip_id = v_ride.trip_id
     and s.reached_at is null
     and s.seq < (select seq from public.trip_stops
                   where trip_id = v_ride.trip_id and ride_id = p_ride_id and kind = 'drop');

  return jsonb_build_object(
    'pooled', v_ride.pooled,
    'shareable', v_ride.shareable,
    'seats', v_ride.seats,
    'seats_occupied', v_ride.seats_occupied,
    'promised_detour_min', v_ride.promised_detour_min,
    'drop_verified', v_ride.drop_verified,
    'stops_before_drop', coalesce(v_before, 0),
    'co_passengers', v_mates
  );
end;
$$;
grant execute on function public.ride_pool_context(uuid) to authenticated;
