-- ============================================================================
-- Gol·Gol — trips, en-route pooling and adaptive seat capacity
--
-- Implements the flow in docs/POOLING_ARCHITECTURE.md:
--
--   driver goes on duty → rider books normally → driver is notified and accepts
--   → at pickup the driver confirms how many people actually got in
--   → the fare settles on that headcount, not on what was booked
--   → while seats remain, the driver is offered further requests whose pickup
--     AND drop both lie along the route they are already driving
--
-- Design notes
-- ------------
-- * No PostGIS. The corridor test is plane trigonometry over the polyline of
--   remaining stops (equirectangular projection — exact enough at city scale,
--   where a degree of longitude never changes by more than a fraction of a
--   percent across a single trip). This keeps the migration runnable on a
--   stock Postgres and removes an extension dependency from the project.
--   Swapping in geography(LineString) + GiST is a later optimisation; the
--   call sites are `path_locate` and `poolable_rides`, nothing else.
--
-- * Straight-line distance under-estimates road distance, which would let a
--   detour slip past the cap. Every added-distance figure is therefore scaled
--   by `pool_config.road_factor` before being compared against a limit.
--
-- * Capacity is checked at *every stop in the sequence*, not once on accept:
--   two bookings whose spans overlap can exceed the vehicle in the middle of
--   the route while looking fine at both ends.
-- ============================================================================

-- ###########################################################################
-- 1. REFERENCE DATA
-- ###########################################################################

-- Seat counts used to live only in frontend/src/lib/vehicles.js, where they
-- were presentational. Under pooling they are a correctness constraint, so
-- they move into the database and the frontend reads them from here.
create table if not exists public.vehicle_classes (
  id                     text primary key,
  label                  text    not null,
  seat_capacity          smallint not null check (seat_capacity between 1 and 8),
  allows_concurrent_pool boolean not null,
  allows_chaining        boolean not null default true,
  sort_order             smallint not null default 0
);

-- A bike carries exactly one passenger. That is a property of the class, not
-- an arithmetic outcome — hence a column, so no future code path can round
-- its way past it.
insert into public.vehicle_classes (id, label, seat_capacity, allows_concurrent_pool, sort_order) values
  ('bike',  'Bike',        1, false, 1),
  ('auto',  'Auto',        3, true,  2),
  ('mini',  'Mini',        4, true,  3),
  ('sedan', 'Prime Sedan', 4, true,  4),
  ('suv',   'Prime SUV',   6, true,  5)
on conflict (id) do update set
  label                  = excluded.label,
  seat_capacity          = excluded.seat_capacity,
  allows_concurrent_pool = excluded.allows_concurrent_pool,
  sort_order             = excluded.sort_order;

alter table public.vehicle_classes enable row level security;
drop policy if exists vehicle_classes_read on public.vehicle_classes;
create policy vehicle_classes_read on public.vehicle_classes for select to authenticated using (true);

-- Tunables. One row; a city column can be added later without touching callers.
create table if not exists public.pool_config (
  id                  boolean primary key default true check (id),
  corridor_km         numeric  not null default 1.2,  -- how far off-route a stop may sit
  max_extension_km    numeric  not null default 3.0,  -- how far past the last drop a new drop may go
  max_detour_min      integer  not null default 8,    -- absolute added-time cap per rider aboard
  max_detour_pct      integer  not null default 40,   -- relative cap, whichever is tighter
  max_pickup_wait_min integer  not null default 12,   -- how long a new rider may wait for a pooled car
  avg_speed_kmh       numeric  not null default 22,   -- city average, for km → minutes
  road_factor         numeric  not null default 1.3,  -- straight-line → road distance
  extra_seat_pct      integer  not null default 40,   -- each seat past the first costs this much of the base
  pool_discount_pct   integer  not null default 20    -- rebate, applied only when a match actually lands
);
insert into public.pool_config (id) values (true) on conflict (id) do nothing;

alter table public.pool_config enable row level security;
drop policy if exists pool_config_read on public.pool_config;
create policy pool_config_read on public.pool_config for select to authenticated using (true);

-- ###########################################################################
-- 2. GEOMETRY HELPERS
-- ###########################################################################

-- Distance from P to segment AB, and where along AB the closest point falls.
-- Works in local metres via equirectangular projection about A.
create or replace function public.point_segment_km(
  plat double precision, plng double precision,
  alat double precision, alng double precision,
  blat double precision, blng double precision,
  out offset_km double precision,
  out t double precision
) language plpgsql immutable as $$
declare
  -- local plane about A: x east, y north, both in degrees-of-latitude units
  -- (`by` is reserved in plpgsql, hence sx/sy for the segment vector)
  k  double precision := cos(radians(alat));
  sx double precision := (blng - alng) * k;
  sy double precision := (blat - alat);
  px double precision := (plng - alng) * k;
  py double precision := (plat - alat);
  len2 double precision;
  cx double precision;
  cy double precision;
begin
  len2 := sx * sx + sy * sy;
  if len2 <= 1e-18 then
    t := 0;
  else
    t := (px * sx + py * sy) / len2;
    t := least(1.0, greatest(0.0, t));
  end if;
  cx := sx * t;
  cy := sy * t;
  -- back to degrees, then to km
  offset_km := public.haversine_km(plat, plng, alat + cy, alng + cx / nullif(k, 0));
  if offset_km is null then
    offset_km := public.haversine_km(plat, plng, alat + cy, alng);
  end if;
end;
$$;

-- Locate a point against an ordered polyline.
--   along_km  — distance from the start of the path to the closest point on it
--   offset_km — how far the point sits off the path
--   total_km  — length of the whole path
-- `p_lats`/`p_lngs` are parallel arrays; NULL or fewer than two points yields
-- NULL, which every caller treats as "not on this route".
create or replace function public.path_locate(
  p_lats double precision[], p_lngs double precision[],
  plat double precision, plng double precision,
  out along_km double precision,
  out offset_km double precision,
  out total_km double precision
) language plpgsql immutable as $$
declare
  i        integer;
  n        integer := coalesce(array_length(p_lats, 1), 0);
  run      double precision := 0;
  seg      double precision;
  best     double precision := null;
  best_at  double precision := null;
  r        record;
begin
  if n < 2 then
    return;
  end if;
  for i in 1 .. n - 1 loop
    seg := public.haversine_km(p_lats[i], p_lngs[i], p_lats[i + 1], p_lngs[i + 1]);
    select * into r from public.point_segment_km(
      plat, plng, p_lats[i], p_lngs[i], p_lats[i + 1], p_lngs[i + 1]
    );
    if best is null or r.offset_km < best then
      best    := r.offset_km;
      best_at := run + seg * r.t;
    end if;
    run := run + seg;
  end loop;
  along_km  := best_at;
  offset_km := best;
  total_km  := run;
end;
$$;

-- Length of a polyline.
create or replace function public.path_length_km(
  p_lats double precision[], p_lngs double precision[]
) returns double precision language plpgsql immutable as $$
declare i integer; n integer := coalesce(array_length(p_lats, 1), 0); run double precision := 0;
begin
  if n < 2 then return 0; end if;
  for i in 1 .. n - 1 loop
    run := run + public.haversine_km(p_lats[i], p_lngs[i], p_lats[i + 1], p_lngs[i + 1]);
  end loop;
  return run;
end;
$$;

-- ###########################################################################
-- 3. TRIPS, STOPS, OCCUPANCY
-- ###########################################################################

-- A trip is the vehicle's work order; a ride row remains one rider's contract.
-- Splitting them is what lets one vehicle serve several contracts at once,
-- each with its own fare, OTP, rating and cancellation.
create table if not exists public.trips (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references public.users (id) on delete cascade,
  vehicle_class   text not null references public.vehicle_classes (id),
  seat_capacity   smallint not null,
  seats_booked    smallint not null default 0,
  seats_occupied  smallint not null default 0,
  pooling_enabled boolean  not null default true,
  status          text     not null default 'active'
                    check (status in ('active','completed','cancelled')),
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  constraint trips_seats_sane check (
    seats_booked   between 0 and seat_capacity and
    seats_occupied between 0 and seat_capacity
  )
);

create index if not exists idx_trips_driver on public.trips (driver_id, status);
create index if not exists idx_trips_open   on public.trips (status) where status = 'active';

-- One live trip per driver. This is the invariant that stops a driver being
-- dispatched twice as though they had two vehicles.
create unique index if not exists idx_trips_one_active_per_driver
  on public.trips (driver_id) where status = 'active';

-- The schedule. `seq` is dense and ascending; `seat_delta` is +seats at a
-- pickup and −seats at a drop, so a running sum over the sequence is the
-- occupancy at every point of the route.
create table if not exists public.trip_stops (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  ride_id    uuid not null references public.rides (id) on delete cascade,
  kind       text not null check (kind in ('pickup','drop')),
  seq        smallint not null,
  lat        double precision not null,
  lng        double precision not null,
  address    text,
  seat_delta smallint not null,
  eta        timestamptz,
  reached_at timestamptz,
  unique (trip_id, ride_id, kind)
);

create index if not exists idx_trip_stops_trip on public.trip_stops (trip_id, seq);
create index if not exists idx_trip_stops_ride on public.trip_stops (ride_id);

-- Who changed the headcount, when, and from which side. Needed for fare
-- disputes, and to tell an honest driver from one under-reporting seats to
-- keep the vehicle to themselves.
create table if not exists public.occupancy_events (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  ride_id      uuid references public.rides (id) on delete set null,
  actor_id     uuid references public.users (id) on delete set null,
  actor_role   text not null check (actor_role in ('driver','rider','system')),
  seats_before smallint not null,
  seats_after  smallint not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_occupancy_trip on public.occupancy_events (trip_id, created_at);

-- A rider who reports a co-passenger is never matched with them again.
create table if not exists public.match_blocklist (
  user_id    uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

-- ###########################################################################
-- 4. RIDES — booking becomes a contract for N seats that may be shared
-- ###########################################################################

alter table public.rides add column if not exists trip_id        uuid references public.trips (id) on delete set null;
alter table public.rides add column if not exists seats          smallint not null default 1;
alter table public.rides add column if not exists seats_occupied smallint;
alter table public.rides add column if not exists shareable      boolean not null default false;
alter table public.rides add column if not exists pooled         boolean not null default false;
alter table public.rides add column if not exists solo_eta_min   integer;
alter table public.rides add column if not exists promised_detour_min integer;
alter table public.rides add column if not exists actual_detour_min   integer;
alter table public.rides add column if not exists pool_discount  numeric not null default 0;
alter table public.rides add column if not exists seat_surcharge numeric not null default 0;

alter table public.rides drop constraint if exists rides_seats_check;
alter table public.rides add constraint rides_seats_check check (seats between 1 and 6);

alter table public.rides drop constraint if exists rides_seats_occupied_check;
alter table public.rides add constraint rides_seats_occupied_check
  check (seats_occupied is null or seats_occupied between 0 and 6);

create index if not exists idx_rides_trip on public.rides (trip_id);
create index if not exists idx_rides_poolable on public.rides (status, shareable)
  where status = 'pending' and shareable;

-- ###########################################################################
-- 5. FARE — priced per seat, settled on the headcount that actually travelled
-- ###########################################################################

-- Seats past the first cost `extra_seat_pct` of the one-seat fare each. A solo
-- booking therefore prices exactly as it did before this migration.
create or replace function public.seat_fare(p_one_seat numeric, p_seats smallint)
returns numeric language sql stable as $$
  select ceil(p_one_seat * (1 + (greatest(p_seats, 1) - 1) * (select extra_seat_pct from public.pool_config) / 100.0));
$$;

-- Replaces 0005's version: the quoted fare now accounts for booked seats.
create or replace function public.rides_set_fare()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg record; one_seat numeric;
begin
  new.distance_km := round(public.haversine_km(new.from_lat, new.from_lng, new.to_lat, new.to_lng)::numeric, 2);
  select * into cfg from public.fare_config where vehicle_type = new.vehicle_type;
  if found then
    one_seat  := (cfg.base_fare + new.distance_km * cfg.per_km) * coalesce(new.surge_multiplier, 1);
    new.fare  := public.seat_fare(one_seat, new.seats);
    new.seat_surcharge := new.fare - ceil(one_seat);
  end if;

  -- A bike cannot carry more than one passenger, whatever the client sent.
  if new.vehicle_type = 'bike' then
    new.seats := 1;
    new.shareable := false;
  end if;

  new.start_otp := null; -- the OTP lives only in public.ride_otps
  if new.scheduled_for is not null and new.scheduled_for > now() + interval '2 minutes' then
    new.status := 'scheduled';
  end if;
  return new;
end;
$$;

-- Re-price a booking after the driver confirms the real headcount.
create or replace function public.reprice_ride(p_ride_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare r public.rides; cfg record; one_seat numeric; billed smallint; new_fare numeric;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null then return null; end if;
  select * into cfg from public.fare_config where vehicle_type = r.vehicle_type;
  if not found then return r.fare; end if;

  -- Seats you booked are yours whether or not you filled them: billing takes
  -- the larger of booked and occupied. Refunding unused seats is an explicit
  -- amendment, not something that happens silently at pickup.
  billed   := greatest(r.seats, coalesce(r.seats_occupied, r.seats));
  one_seat := (cfg.base_fare + r.distance_km * cfg.per_km) * coalesce(r.surge_multiplier, 1);
  new_fare := public.seat_fare(one_seat, billed);

  update public.rides
     set fare = new_fare,
         seat_surcharge = new_fare - ceil(one_seat)
   where id = p_ride_id;
  return new_fare;
end;
$$;

-- ###########################################################################
-- 6. TRIP MECHANICS
-- ###########################################################################

-- Bookings still aboard or still to be served, in stop order.
create or replace function public.trip_live_rides(p_trip_id uuid)
returns setof public.rides language sql stable as $$
  select r.* from public.rides r
   where r.trip_id = p_trip_id
     and r.status in ('accepted','arrived','ongoing')
   order by r.created_at;
$$;

-- Recompute the trip's seat counters from its bookings.
create or replace function public.trip_recount(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_booked smallint; v_occupied smallint;
begin
  select coalesce(sum(r.seats), 0),
         coalesce(sum(case when r.status = 'ongoing'
                           then coalesce(r.seats_occupied, r.seats) else 0 end), 0)
    into v_booked, v_occupied
    from public.rides r
   where r.trip_id = p_trip_id
     and r.status in ('accepted','arrived','ongoing');

  update public.trips
     set seats_booked   = v_booked,
         seats_occupied = v_occupied
   where id = p_trip_id;
end;
$$;

-- Seats each live booking has committed: the larger of what it booked and who
-- actually got in. Conservative on purpose in both directions — a rider who
-- booked two seats and travels alone has still paid for two, and a rider who
-- turned up with a friend consumes the extra seat immediately.
create or replace function public.trip_seats_committed(p_trip_id uuid)
returns smallint language sql stable as $$
  select coalesce(sum(greatest(r.seats, coalesce(r.seats_occupied, r.seats))), 0)::smallint
    from public.rides r
   where r.trip_id = p_trip_id
     and r.status in ('accepted','arrived','ongoing');
$$;

-- Seats a further booking could take.
--
-- This must be summed per booking, not derived from the trip's two counters:
-- with one rider aboard occupying 2 seats and another merely booked for 1,
-- `greatest(seats_booked, seats_occupied)` reads 2 where the true commitment
-- is 3, and the vehicle gets oversold.
create or replace function public.trip_seats_available(p_trip_id uuid)
returns smallint language sql stable as $$
  select greatest(0, t.seat_capacity - public.trip_seats_committed(p_trip_id))::smallint
    from public.trips t where t.id = p_trip_id;
$$;

-- The remaining path: the driver's current position, then every stop not yet
-- reached, in sequence. This is what the corridor is measured against — not
-- the original route, which the vehicle may be halfway through.
create or replace function public.trip_remaining_path(
  p_trip_id uuid,
  out lats double precision[], out lngs double precision[]
) language plpgsql stable as $$
declare d record;
begin
  select current_lat, current_lng into d
    from public.active_drivers a
    join public.trips t on t.driver_id = a.user_id
   where t.id = p_trip_id;

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
end;
$$;

-- Walk the stop sequence accumulating seat_delta and raise if the vehicle is
-- over capacity at any point. Two bookings can each fit on their own and still
-- overflow where their spans overlap, which is exactly what this catches.
create or replace function public.trip_assert_capacity(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; running integer := 0; cap smallint;
begin
  select seat_capacity into cap from public.trips where id = p_trip_id;

  -- Seed with whoever is already in the vehicle. Their pickup stop is marked
  -- reached and so contributes nothing to the walk below, but their drop still
  -- subtracts — starting from zero would make the running total go negative
  -- and hide a genuine overflow in the middle of the route.
  select coalesce(sum(greatest(r.seats, coalesce(r.seats_occupied, r.seats))), 0)
    into running
    from public.rides r
   where r.trip_id = p_trip_id and r.status = 'ongoing';

  if running > cap then
    raise exception 'trip % already over capacity % (% aboard)', p_trip_id, cap, running
      using errcode = '23514';
  end if;

  for s in
    select seat_delta from public.trip_stops
     where trip_id = p_trip_id and reached_at is null order by seq
  loop
    running := running + s.seat_delta;
    if running > cap then
      raise exception 'trip % exceeds capacity % (reaches %)', p_trip_id, cap, running
        using errcode = '23514';
    end if;
  end loop;
end;
$$;

-- How far along the remaining path a stop effectively sits.
--
-- `path_locate` clamps projections to the path, so every stop *beyond* the end
-- returns the same along_km and they would tie. When the projection lands at
-- the end, the straight-line distance past it is added, which orders
-- beyond-the-end drops correctly — the second rider travelling farther than the
-- first sorts after them, which is precisely the case this feature exists for.
create or replace function public.stop_progress(
  p_lats double precision[], p_lngs double precision[],
  plat double precision, plng double precision
) returns double precision language plpgsql immutable as $$
declare loc record;
begin
  select * into loc from public.path_locate(p_lats, p_lngs, plat, plng);
  if loc.along_km is null then return 0; end if;
  if loc.total_km - loc.along_km < 0.05 then
    return loc.along_km + loc.offset_km;   -- past the end: order by how far past
  end if;
  return loc.along_km;
end;
$$;

-- Insert a booking's pickup and drop into the sequence at the positions their
-- progress along the remaining route implies, then renumber the whole schedule.
-- Ordering by progress is what keeps the sequence sane without a full O(n²)
-- insertion search: a stop can never land before one already passed.
create or replace function public.trip_place_stops(p_trip_id uuid, p_ride_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r    public.rides;
  path record;
begin
  select * into r from public.rides where id = p_ride_id;

  insert into public.trip_stops (trip_id, ride_id, kind, seq, lat, lng, address, seat_delta)
  values
    (p_trip_id, p_ride_id, 'pickup', 0, r.from_lat, r.from_lng, r.from_address,  r.seats),
    (p_trip_id, p_ride_id, 'drop',   0, r.to_lat,   r.to_lng,   r.to_address,   -r.seats)
  on conflict (trip_id, ride_id, kind) do nothing;

  select * into path from public.trip_remaining_path(p_trip_id);

  -- Stops already reached keep their order and stay at the front; the rest are
  -- ordered by progress along what is left of the route.
  with ranked as (
    select s.id,
           case when s.reached_at is not null then 0 else 1 end                    as tier,
           case when s.reached_at is not null then s.seq::double precision
                else public.stop_progress(path.lats, path.lngs, s.lat, s.lng) end  as pos,
           case when s.kind = 'pickup' then 0 else 1 end                           as kind_rank,
           rd.created_at
      from public.trip_stops s
      join public.rides rd on rd.id = s.ride_id
     where s.trip_id = p_trip_id
  ), ordered as (
    select id, (row_number() over (order by tier, pos, kind_rank, created_at) - 1)::smallint as rn
      from ranked
  )
  update public.trip_stops s
     set seq = o.rn
    from ordered o
   where o.id = s.id;

  -- Geometry can still produce an impossible pair (a drop that projects before
  -- its own pickup when the pickup is off-corridor). Force the invariant.
  perform public.trip_fix_pair(p_trip_id, p_ride_id);
end;
$$;

-- Guarantee pickup-before-drop for one booking by swapping their seq values.
create or replace function public.trip_fix_pair(p_trip_id uuid, p_ride_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p_seq smallint; d_seq smallint;
begin
  select seq into p_seq from public.trip_stops
   where trip_id = p_trip_id and ride_id = p_ride_id and kind = 'pickup';
  select seq into d_seq from public.trip_stops
   where trip_id = p_trip_id and ride_id = p_ride_id and kind = 'drop';
  if p_seq is not null and d_seq is not null and d_seq < p_seq then
    update public.trip_stops set seq = -1
     where trip_id = p_trip_id and ride_id = p_ride_id and kind = 'pickup';
    update public.trip_stops set seq = p_seq
     where trip_id = p_trip_id and ride_id = p_ride_id and kind = 'drop';
    update public.trip_stops set seq = d_seq
     where trip_id = p_trip_id and ride_id = p_ride_id and kind = 'pickup';
  end if;
end;
$$;

-- Remove a booking from the schedule and close the gap.
create or replace function public.trip_drop_booking(p_trip_id uuid, p_ride_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.trip_stops
   where trip_id = p_trip_id and ride_id = p_ride_id and reached_at is null;

  with ordered as (
    select id, row_number() over (order by seq) - 1 as rn
      from public.trip_stops where trip_id = p_trip_id
  )
  update public.trip_stops s set seq = (select rn from ordered o where o.id = s.id)
   where s.trip_id = p_trip_id;

  perform public.trip_recount(p_trip_id);
end;
$$;

-- ###########################################################################
-- 7. MATCHING
-- ###########################################################################

-- Insert two points into a path by their progress along it, keeping the first
-- element (the vehicle's current position) pinned at the front, and return how
-- much longer the path becomes. This is the detour, before the road factor.
create or replace function public.path_added_km(
  p_lats double precision[], p_lngs double precision[],
  plat double precision, plng double precision,
  dlat double precision, dlng double precision
) returns double precision language plpgsql immutable as $$
declare
  n     integer := coalesce(array_length(p_lats, 1), 0);
  lats  double precision[] := '{}';
  lngs  double precision[] := '{}';
  old_len double precision;
  new_len double precision;
  ins   record;
begin
  if n < 2 then return null; end if;
  old_len := public.path_length_km(p_lats, p_lngs);

  -- element 1 stays first; the rest are re-ordered together with the new pair
  lats := array[p_lats[1]]; lngs := array[p_lngs[1]];

  for ins in
    select * from (
      -- `ix`, not `i`: a bare `i` would be ambiguous against a plpgsql variable
      select p_lats[g.ix] as la, p_lngs[g.ix] as ln,
             public.stop_progress(p_lats, p_lngs, p_lats[g.ix], p_lngs[g.ix]) as pg,
             1 as tie
        from generate_series(2, n) as g(ix)
      union all
      select plat, plng, public.stop_progress(p_lats, p_lngs, plat, plng), 0
      union all
      select dlat, dlng, public.stop_progress(p_lats, p_lngs, dlat, dlng), 2
    ) q order by pg, tie
  loop
    lats := array_append(lats, ins.la);
    lngs := array_append(lngs, ins.ln);
  end loop;

  new_len := public.path_length_km(lats, lngs);
  return greatest(0, new_len - old_len);
end;
$$;

-- Pending requests a driver could pick up *without leaving the road they are
-- already on*. This is the query behind the pooled-ride offer card.
--
-- The gates, in order of cost:
--   1. the trip has seats, its class allows pooling, everyone aboard consented
--   2. the request is shareable, matches the class, and fits the free seats
--   3. both its pickup and its drop sit within the corridor of the remaining
--      route — or, for the drop, no more than max_extension_km past its end
--   4. the drop is further along than the pickup (nobody travels backwards)
--   5. the detour costs less than the promise made to the riders aboard
--   6. the new rider is not waiting longer than max_pickup_wait_min
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
  created_at     timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_trip  public.trips;
  cfg     public.pool_config;
  path    record;
  free    smallint;
  path_km double precision;
begin
  select t.* into v_trip
    from public.trips t
   where t.driver_id = auth.uid() and t.status = 'active';
  if v_trip.id is null then return; end if;

  select * into cfg from public.pool_config where id;

  -- class must allow carrying two contracts at once (bikes never do)
  if not exists (
    select 1 from public.vehicle_classes vc
     where vc.id = v_trip.vehicle_class and vc.allows_concurrent_pool
  ) or not v_trip.pooling_enabled then
    return;
  end if;

  -- everyone already aboard must have consented to sharing
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
           public.stop_progress(path.lats, path.lngs, r.to_lat,   r.to_lng)   as d_prog
      from public.rides r
     where r.status = 'pending'
       and r.shareable
       and r.driver_id is null
       and r.trip_id is null
       and r.rider_id <> auth.uid()
       and r.vehicle_type = v_trip.vehicle_class
       and r.seats <= free
       and coalesce(r.scheduled_for, now()) <= now() + interval '2 minutes'
       -- never re-match two people who have blocked each other
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
       -- the drop may sit off-corridor only by running past the end of the
       -- route: the second rider travelling further than the first is the
       -- whole point, so allow that within max_extension_km
       and (c.d_off <= cfg.corridor_km or c.d_prog - path_km <= cfg.max_extension_km)
       and c.d_prog > c.p_prog
  )
  select s.id, u.name, s.from_address, s.to_address,
         s.from_lat, s.from_lng, s.to_lat, s.to_lng,
         s.seats, s.fare, s.distance_km,
         round(s.p_off::numeric, 2), round(s.d_off::numeric, 2),
         round(s.add_km::numeric, 2),
         ceil(s.add_km * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer,
         ceil(s.p_prog * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer,
         s.created_at
    from scored s
    join public.users u on u.id = s.rider_id
   where s.add_km * cfg.road_factor / cfg.avg_speed_kmh * 60 <= cfg.max_detour_min
     and s.p_prog * cfg.road_factor / cfg.avg_speed_kmh * 60 <= cfg.max_pickup_wait_min
   order by s.add_km, s.p_prog
   limit greatest(1, p_limit);
end;
$$;
grant execute on function public.poolable_rides(integer) to authenticated;

-- ###########################################################################
-- 8. STATE TRANSITIONS
-- ###########################################################################

-- Accept a request. Opens a trip for the driver if they do not already have
-- one, and places the booking's two stops in the schedule.
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride  public.rides;
  v_trip  public.trips;
  v_class text;
  v_cap   smallint;
begin
  select d.vehicle_class into v_class
    from public.drivers d
   where d.user_id = auth.uid() and d.verification_status = 'approved';
  if v_class is null then
    raise exception 'not an approved driver' using errcode = '42501';
  end if;

  -- A driver already carrying someone joins them through accept_pooled_ride,
  -- which enforces the corridor. This path is for starting a fresh trip.
  if exists (
    select 1 from public.trips t
     where t.driver_id = auth.uid() and t.status = 'active'
       and exists (select 1 from public.rides r
                    where r.trip_id = t.id and r.status in ('accepted','arrived','ongoing'))
  ) then
    raise exception 'already on a trip — use accept_pooled_ride' using errcode = '55006';
  end if;

  select seat_capacity into v_cap from public.vehicle_classes where id = v_class;

  update public.rides
     set status = 'accepted', driver_id = auth.uid(), accepted_at = now()
   where id = p_ride_id and status = 'pending' and driver_id is null
  returning * into v_ride;
  if v_ride.id is null then return null; end if;

  -- reuse an empty trip rather than leaving orphans behind
  select * into v_trip from public.trips
   where driver_id = auth.uid() and status = 'active' limit 1;
  if v_trip.id is null then
    insert into public.trips (driver_id, vehicle_class, seat_capacity, started_at)
    values (auth.uid(), v_class, coalesce(v_cap, 1), now())
    returning * into v_trip;
  end if;

  update public.rides set trip_id = v_trip.id where id = v_ride.id
  returning * into v_ride;

  perform public.trip_place_stops(v_trip.id, v_ride.id);
  perform public.trip_recount(v_trip.id);
  perform public.trip_assert_capacity(v_trip.id);

  update public.active_drivers
     set on_ride = true, current_ride_id = p_ride_id, heartbeat_at = now()
   where user_id = auth.uid();

  return v_ride;
end;
$$;
grant execute on function public.accept_ride(uuid) to authenticated;

-- Take a second (third…) booking onto a trip already under way.
--
-- Everything the offer card showed is recomputed here under a row lock on the
-- trip: the seats, the corridor and the detour. The read that produced the
-- offer is never trusted, because another dispatcher may have filled the seat
-- in between.
create or replace function public.accept_pooled_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride public.rides;
  v_trip public.trips;
  cfg    public.pool_config;
  path   record;
  free   smallint;
  p_loc  record;
  d_loc  record;
  p_prog double precision;
  d_prog double precision;
  path_km double precision;
  add_km double precision;
begin
  select * into cfg from public.pool_config where id;

  select t.* into v_trip
    from public.trips t
   where t.driver_id = auth.uid() and t.status = 'active'
     for update;                                   -- serialise concurrent joins
  if v_trip.id is null then
    raise exception 'no active trip' using errcode = '55006';
  end if;

  if not exists (
    select 1 from public.vehicle_classes vc
     where vc.id = v_trip.vehicle_class and vc.allows_concurrent_pool
  ) then
    raise exception 'this vehicle class cannot pool' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.rides r
     where r.trip_id = v_trip.id
       and r.status in ('accepted','arrived','ongoing')
       and not r.shareable
  ) then
    raise exception 'a rider aboard did not consent to sharing' using errcode = '22023';
  end if;

  select * into v_ride from public.rides
   where id = p_ride_id and status = 'pending' and driver_id is null
     for update;
  if v_ride.id is null then return null; end if;      -- someone else took it
  if not v_ride.shareable then
    raise exception 'that rider did not opt into sharing' using errcode = '22023';
  end if;
  if v_ride.vehicle_type is distinct from v_trip.vehicle_class then
    raise exception 'wrong vehicle class' using errcode = '22023';
  end if;

  free := public.trip_seats_available(v_trip.id);
  if v_ride.seats > free then
    raise exception 'only % seat(s) left', free using errcode = '23514';
  end if;

  -- re-run the corridor and detour tests against the *current* route
  select * into path from public.trip_remaining_path(v_trip.id);
  if coalesce(array_length(path.lats, 1), 0) < 2 then
    raise exception 'trip has no remaining route' using errcode = '22023';
  end if;
  path_km := public.path_length_km(path.lats, path.lngs);

  select * into p_loc from public.path_locate(path.lats, path.lngs, v_ride.from_lat, v_ride.from_lng);
  select * into d_loc from public.path_locate(path.lats, path.lngs, v_ride.to_lat,   v_ride.to_lng);
  p_prog := public.stop_progress(path.lats, path.lngs, v_ride.from_lat, v_ride.from_lng);
  d_prog := public.stop_progress(path.lats, path.lngs, v_ride.to_lat,   v_ride.to_lng);

  if p_loc.offset_km > cfg.corridor_km then
    raise exception 'pickup is % km off the route', round(p_loc.offset_km::numeric, 1)
      using errcode = '22023';
  end if;
  if d_loc.offset_km > cfg.corridor_km and d_prog - path_km > cfg.max_extension_km then
    raise exception 'drop is too far off the route' using errcode = '22023';
  end if;
  if d_prog <= p_prog then
    raise exception 'that drop is behind the pickup' using errcode = '22023';
  end if;

  add_km := public.path_added_km(path.lats, path.lngs,
                                 v_ride.from_lat, v_ride.from_lng,
                                 v_ride.to_lat,   v_ride.to_lng);
  if add_km * cfg.road_factor / cfg.avg_speed_kmh * 60 > cfg.max_detour_min then
    raise exception 'detour is longer than promised to the riders aboard' using errcode = '22023';
  end if;

  update public.rides
     set status = 'accepted', driver_id = auth.uid(), accepted_at = now(),
         trip_id = v_trip.id, pooled = true,
         promised_detour_min = ceil(add_km * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer
   where id = p_ride_id
  returning * into v_ride;

  -- everyone already aboard is now sharing too, and is owed the rebate
  update public.rides
     set pooled = true,
         promised_detour_min = greatest(
           coalesce(promised_detour_min, 0),
           ceil(add_km * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer)
   where trip_id = v_trip.id
     and status in ('accepted','arrived','ongoing');

  perform public.trip_place_stops(v_trip.id, v_ride.id);
  perform public.trip_recount(v_trip.id);
  perform public.trip_assert_capacity(v_trip.id);

  insert into public.ride_events (ride_id, actor_id, status, note, meta)
  values (p_ride_id, auth.uid(), 'accepted', 'joined a shared trip',
          jsonb_build_object('trip_id', v_trip.id, 'pooled', true,
                             'added_km', round(add_km::numeric, 2)));

  return v_ride;
end;
$$;
grant execute on function public.accept_pooled_ride(uuid) to authenticated;

-- ###########################################################################
-- 9. HEADCOUNT — the number the fare actually settles on
-- ###########################################################################

-- The driver confirms how many people got in at this pickup, and the booking
-- starts. Replaces 0005's `start_ride`: the OTP check is unchanged, the
-- headcount and the stop bookkeeping are new.
--
-- Returns the bookings (if any) that no longer fit now that the vehicle is
-- fuller than booked, so the caller can re-dispatch them rather than leave
-- someone waiting at a kerb for a car that cannot take them.
-- The old two-argument form must go: adding a defaulted third parameter
-- creates an overload rather than replacing it, and every existing client
-- calling with two arguments would keep hitting the pre-pooling version.
drop function if exists public.start_ride(uuid, text);
create or replace function public.start_ride(
  p_ride_id uuid, p_otp text, p_headcount smallint default null
) returns table (ok boolean, displaced_ride_id uuid) language plpgsql
security definer set search_path = public as $$
declare
  v_ride  public.rides;
  v_trip  public.trips;
  v_head  smallint;
  v_valid boolean;
  v_over  integer;
  r       record;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null or v_ride.driver_id is distinct from auth.uid()
     or v_ride.status not in ('accepted','arrived') then
    return query select false, null::uuid; return;
  end if;

  select exists (
    select 1 from public.ride_otps o where o.ride_id = p_ride_id and o.otp = p_otp
  ) into v_valid;
  if not v_valid then
    return query select false, null::uuid; return;
  end if;

  select * into v_trip from public.trips where id = v_ride.trip_id for update;

  -- A headcount below what was booked does not free seats — those are sold.
  -- Above it, the extra seats are charged and capacity shrinks immediately.
  v_head := greatest(coalesce(p_headcount, v_ride.seats), 1);
  if v_trip.id is not null then
    v_head := least(v_head, v_trip.seat_capacity);
  end if;

  update public.rides
     set status = 'ongoing', started_at = now(), seats_occupied = v_head
   where id = p_ride_id;

  insert into public.occupancy_events (trip_id, ride_id, actor_id, actor_role,
                                       seats_before, seats_after, reason)
  values (v_ride.trip_id, p_ride_id, auth.uid(), 'driver',
          v_ride.seats, v_head, 'pickup_headcount');

  perform public.reprice_ride(p_ride_id);

  if v_trip.id is not null then
    update public.trip_stops
       set reached_at = now(), seat_delta = v_head
     where trip_id = v_trip.id and ride_id = p_ride_id and kind = 'pickup';
    update public.trip_stops
       set seat_delta = -v_head
     where trip_id = v_trip.id and ride_id = p_ride_id and kind = 'drop';

    perform public.trip_recount(v_trip.id);

    -- Did the extra bodies push an already-accepted booking out of the vehicle?
    select greatest(0, public.trip_seats_committed(t.id) - t.seat_capacity)
      into v_over
      from public.trips t where t.id = v_trip.id;

    if coalesce(v_over, 0) > 0 then
      -- displace the most recently accepted booking first: it is the one whose
      -- rider has waited least and can be re-matched with least disruption
      for r in
        select id from public.rides
         where trip_id = v_trip.id and status = 'accepted'
         order by accepted_at desc nulls first
      loop
        perform public.displace_booking(r.id, 'capacity_displaced');
        select greatest(0, public.trip_seats_committed(t.id) - t.seat_capacity)
          into v_over from public.trips t where t.id = v_trip.id;
        return query select true, r.id;
        exit when coalesce(v_over, 0) <= 0;
      end loop;
      return;
    end if;
  end if;

  return query select true, null::uuid;
end;
$$;
grant execute on function public.start_ride(uuid, text, smallint) to authenticated;

-- Put a booking back on the market, at no cost to the rider, because the
-- vehicle that accepted it can no longer carry them.
create or replace function public.displace_booking(p_ride_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.rides where id = p_ride_id;

  update public.rides
     set status = 'pending', driver_id = null, trip_id = null,
         accepted_at = null, cancellation_reason = p_reason,
         pooled = false, promised_detour_min = null
   where id = p_ride_id;

  if v_trip is not null then
    perform public.trip_drop_booking(v_trip, p_ride_id);
  end if;

  insert into public.ride_events (ride_id, status, note, meta)
  values (p_ride_id, 'pending', 'returned to dispatch', jsonb_build_object('reason', p_reason));

  insert into public.notifications (user_id, type, title, body, url, data)
  select r.rider_id, 'ride', 'Finding you another ride',
         'Your driver''s vehicle filled up. We''re matching you again now — at no extra cost.',
         '/', jsonb_build_object('ride_id', r.id, 'reason', p_reason)
    from public.rides r where r.id = p_ride_id;
end;
$$;

-- Rider adds a passenger mid-booking, with the charge shown before it applies.
create or replace function public.confirm_extra_occupant(p_ride_id uuid, p_seats smallint)
returns public.rides language plpgsql security definer set search_path = public as $$
declare v_ride public.rides; v_free smallint;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then raise exception 'ride not found'; end if;
  if auth.uid() not in (v_ride.rider_id, coalesce(v_ride.driver_id, auth.uid())) then
    raise exception 'not your ride' using errcode = '42501';
  end if;
  if v_ride.status not in ('accepted','arrived','ongoing') then return v_ride; end if;

  if v_ride.trip_id is not null then
    v_free := public.trip_seats_available(v_ride.trip_id)
              + greatest(v_ride.seats, coalesce(v_ride.seats_occupied, v_ride.seats));
    if p_seats > v_free then
      raise exception 'only % seat(s) available', v_free using errcode = '23514';
    end if;
  end if;

  insert into public.occupancy_events (trip_id, ride_id, actor_id, actor_role,
                                       seats_before, seats_after, reason)
  values (v_ride.trip_id, p_ride_id, auth.uid(),
          case when auth.uid() = v_ride.rider_id then 'rider' else 'driver' end,
          coalesce(v_ride.seats_occupied, v_ride.seats), p_seats, 'extra_occupant');

  update public.rides set seats = greatest(seats, p_seats), seats_occupied = p_seats
   where id = p_ride_id returning * into v_ride;

  update public.trip_stops set seat_delta = case when kind = 'pickup' then p_seats else -p_seats end
   where ride_id = p_ride_id;

  perform public.reprice_ride(p_ride_id);
  if v_ride.trip_id is not null then perform public.trip_recount(v_ride.trip_id); end if;

  select * into v_ride from public.rides where id = p_ride_id;
  return v_ride;
end;
$$;
grant execute on function public.confirm_extra_occupant(uuid, smallint) to authenticated;

-- ###########################################################################
-- 10. COMPLETION & CANCELLATION, per booking
-- ###########################################################################

-- Settle one booking. The trip only ends when its last booking does — dropping
-- one rider must never end the journey for the others, which is the single
-- biggest behavioural difference from the old 1:1 model.
create or replace function public.complete_ride(p_ride_id uuid, p_waiting_minutes integer default 0)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride public.rides; cfg record; pcfg public.pool_config;
  v_base numeric := 0; v_dist numeric := 0; v_surge numeric := 0;
  v_wait numeric := 0; v_seat numeric := 0; v_disc numeric := 0;
  v_total numeric := 0; v_platform numeric := 0; v_billed smallint;
  v_remaining integer;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then raise exception 'ride not found'; end if;
  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'only the assigned driver can complete this ride' using errcode = '42501';
  end if;
  if v_ride.status <> 'ongoing' then return v_ride; end if;

  select * into cfg  from public.fare_config where vehicle_type = v_ride.vehicle_type;
  select * into pcfg from public.pool_config where id;

  -- Billed on the headcount that actually travelled, never below what was booked.
  v_billed  := greatest(v_ride.seats, coalesce(v_ride.seats_occupied, v_ride.seats));
  v_base    := coalesce(cfg.base_fare, 0);
  v_dist    := round(coalesce(v_ride.distance_km, 0) * coalesce(cfg.per_km, 0), 2);
  v_surge   := round((v_base + v_dist) * (coalesce(v_ride.surge_multiplier, 1) - 1), 2);
  v_seat    := round((v_base + v_dist + v_surge) * (v_billed - 1) * pcfg.extra_seat_pct / 100.0, 2);
  v_wait    := greatest(0, coalesce(p_waiting_minutes, 0) - 3) * 2;  -- ₹2/min after 3 free minutes

  -- The sharing rebate is paid only when a match actually landed, so the
  -- discount costs nothing on the rides that never found one.
  if v_ride.pooled then
    v_disc := round((v_base + v_dist + v_surge + v_seat) * pcfg.pool_discount_pct / 100.0, 2);
  end if;

  v_total    := ceil(v_base + v_dist + v_surge + v_seat + v_wait - v_disc);
  v_platform := round(v_total * 0.15, 2);

  update public.rides
     set status = 'completed',
         completed_at = now(),
         final_fare = v_total,
         seat_surcharge = v_seat,
         pool_discount = v_disc,
         payment_status = case when payment_method = 'cash' then 'paid' else 'pending' end
   where id = p_ride_id
  returning * into v_ride;

  insert into public.payments (ride_id, payer_id, payee_id, method, status,
                               base_fare, distance_fare, surge_amount, waiting_fee,
                               platform_fee, driver_payout, amount, settled_at)
  values (v_ride.id, v_ride.rider_id, v_ride.driver_id, v_ride.payment_method,
          v_ride.payment_status, v_base, v_dist + v_seat, v_surge, v_wait,
          v_platform, v_total - v_platform, v_total,
          case when v_ride.payment_status = 'paid' then now() else null end)
  on conflict (ride_id) do update
    set amount = excluded.amount, status = excluded.status, settled_at = excluded.settled_at;

  if v_ride.trip_id is not null then
    update public.trip_stops set reached_at = now()
     where trip_id = v_ride.trip_id and ride_id = p_ride_id and kind = 'drop';
    perform public.trip_recount(v_ride.trip_id);

    select count(*) into v_remaining from public.rides
     where trip_id = v_ride.trip_id and status in ('accepted','arrived','ongoing');

    if v_remaining = 0 then
      update public.trips set status = 'completed', ended_at = now()
       where id = v_ride.trip_id;
      update public.active_drivers
         set on_ride = false, current_ride_id = null, heartbeat_at = now()
       where user_id = auth.uid();
    else
      -- still carrying someone: point the driver at whoever is next
      update public.active_drivers
         set current_ride_id = (
               select s.ride_id from public.trip_stops s
                where s.trip_id = v_ride.trip_id and s.reached_at is null
                order by s.seq limit 1),
             heartbeat_at = now()
       where user_id = auth.uid();
    end if;
  else
    update public.active_drivers
       set on_ride = false, current_ride_id = null, heartbeat_at = now()
     where user_id = auth.uid();
  end if;

  return v_ride;
end;
$$;
grant execute on function public.complete_ride(uuid, integer) to authenticated;

-- Cancel one booking. Same fee policy as before; the difference is that the
-- trip survives if anyone else is still aboard.
create or replace function public.cancel_ride(p_ride_id uuid, p_reason text default null)
returns public.rides language plpgsql security definer set search_path = public as $$
declare v_ride public.rides; v_fee numeric := 0; v_actor uuid := auth.uid(); v_remaining integer;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then raise exception 'ride not found'; end if;
  if v_actor not in (v_ride.rider_id, coalesce(v_ride.driver_id, v_actor)) then
    raise exception 'not your ride' using errcode = '42501';
  end if;
  if v_ride.status in ('completed','cancelled','expired') then return v_ride; end if;
  if v_ride.status = 'ongoing' then
    raise exception 'a ride in progress cannot be cancelled' using errcode = '22023';
  end if;

  if v_actor = v_ride.rider_id
     and v_ride.accepted_at is not null
     and now() - v_ride.accepted_at > interval '2 minutes' then
    v_fee := 30;
  end if;

  update public.rides
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
         cancellation_reason = p_reason, cancellation_fee = v_fee,
         payment_status = case when v_fee > 0 then 'pending' else 'waived' end
   where id = p_ride_id
  returning * into v_ride;

  if v_ride.trip_id is not null then
    perform public.trip_drop_booking(v_ride.trip_id, p_ride_id);

    select count(*) into v_remaining from public.rides
     where trip_id = v_ride.trip_id and status in ('accepted','arrived','ongoing');

    if v_remaining = 0 then
      update public.trips set status = 'cancelled', ended_at = now() where id = v_ride.trip_id;
      update public.active_drivers set on_ride = false, current_ride_id = null
       where user_id = v_ride.driver_id;
    end if;
  elsif v_ride.driver_id is not null then
    update public.active_drivers set on_ride = false, current_ride_id = null
     where user_id = v_ride.driver_id;
  end if;

  if v_fee > 0 then
    insert into public.payments (ride_id, payer_id, payee_id, method, status,
                                 cancellation_fee, amount)
    values (v_ride.id, v_ride.rider_id, v_ride.driver_id, v_ride.payment_method,
            'pending', v_fee, v_fee)
    on conflict (ride_id) do update set cancellation_fee = excluded.cancellation_fee,
                                        amount = excluded.amount;
  end if;

  return v_ride;
end;
$$;
grant execute on function public.cancel_ride(uuid, text) to authenticated;

-- A driver mid-trip must not be offered fresh solo work.
drop function if exists public.nearby_pending_rides(double precision, double precision, text, double precision);
create or replace function public.nearby_pending_rides(
  p_lat double precision, p_lng double precision,
  p_vehicle text default null, p_radius_km double precision default 5
) returns table (
  id uuid, rider_id uuid, rider_name text, from_address text, to_address text,
  from_lat double precision, from_lng double precision,
  to_lat double precision, to_lng double precision,
  vehicle_type text, distance_km numeric, fare numeric, seats smallint,
  shareable boolean, created_at timestamptz, pickup_distance_km double precision
) language sql security definer set search_path = public as $$
  select r.id, r.rider_id, u.name, r.from_address, r.to_address,
         r.from_lat, r.from_lng, r.to_lat, r.to_lng,
         r.vehicle_type, r.distance_km, r.fare, r.seats, r.shareable, r.created_at,
         round(public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng)::numeric, 2)::double precision
    from public.rides r
    join public.users u on u.id = r.rider_id
   where r.status = 'pending'
     and r.driver_id is null
     and r.rider_id <> auth.uid()
     and (p_vehicle is null or r.vehicle_type = p_vehicle)
     and public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) <= p_radius_km
     -- a driver already carrying a passenger gets offers through poolable_rides
     and not exists (
       select 1 from public.trips t
        where t.driver_id = auth.uid() and t.status = 'active'
          and exists (select 1 from public.rides x
                       where x.trip_id = t.id and x.status in ('accepted','arrived','ongoing'))
     )
   order by public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng)
   limit 20;
$$;
grant execute on function public.nearby_pending_rides(double precision, double precision, text, double precision) to authenticated;

-- ###########################################################################
-- 11. READ MODELS
-- ###########################################################################

-- Everything the driver's active-trip screen needs, in one round trip: the
-- vehicle's seat state and the stop list in the order it must be driven.
create or replace function public.driver_trip_state()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_trip public.trips; v_stops jsonb; v_rides jsonb;
begin
  select * into v_trip from public.trips
   where driver_id = auth.uid() and status = 'active';
  if v_trip.id is null then return null; end if;

  select coalesce(jsonb_agg(x order by x.seq), '[]'::jsonb) into v_stops
    from (
      select s.seq, s.kind, s.lat, s.lng, s.address, s.seat_delta,
             s.reached_at, s.ride_id,
             u.name as rider_name, r.status as ride_status,
             r.seats, r.seats_occupied, r.fare, r.pooled
        from public.trip_stops s
        join public.rides r on r.id = s.ride_id
        join public.users u on u.id = r.rider_id
       where s.trip_id = v_trip.id
    ) x;

  select coalesce(jsonb_agg(y), '[]'::jsonb) into v_rides
    from (
      select r.id, r.status, r.seats, r.seats_occupied, r.fare, r.pooled,
             r.from_address, r.to_address, r.payment_method,
             u.name as rider_name, u.mobile as rider_mobile
        from public.rides r
        join public.users u on u.id = r.rider_id
       where r.trip_id = v_trip.id
         and r.status in ('accepted','arrived','ongoing')
       order by r.created_at
    ) y;

  return jsonb_build_object(
    'trip', to_jsonb(v_trip),
    'seats_available', public.trip_seats_available(v_trip.id),
    'stops', v_stops,
    'rides', v_rides
  );
end;
$$;
grant execute on function public.driver_trip_state() to authenticated;

-- What a rider may know about a trip they are sharing.
--
-- Deliberately a projection rather than a policy on `rides`: co-passengers get
-- a first name and a rating and nothing else — no number, no last name, and
-- above all no addresses, since the stop list would otherwise reveal where a
-- stranger lives.
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

  -- how many stops the vehicle makes before this rider is dropped
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
    'stops_before_drop', coalesce(v_before, 0),
    'co_passengers', v_mates
  );
end;
$$;
grant execute on function public.ride_pool_context(uuid) to authenticated;

-- Seat capacities for the booking UI, so the client stops hard-coding them.
create or replace function public.vehicle_seat_capacities()
returns setof public.vehicle_classes language sql stable as $$
  select * from public.vehicle_classes order by sort_order;
$$;
grant execute on function public.vehicle_seat_capacities() to authenticated, anon;

-- Never match me with this person again.
create or replace function public.block_co_passenger(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.match_blocklist (user_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing;
end;
$$;
grant execute on function public.block_co_passenger(uuid) to authenticated;

-- ###########################################################################
-- 12. ROW LEVEL SECURITY
-- ###########################################################################

alter table public.trips            enable row level security;
alter table public.trip_stops       enable row level security;
alter table public.occupancy_events enable row level security;
alter table public.match_blocklist  enable row level security;

-- A trip is readable by its driver and by anyone riding on it. Writes go
-- exclusively through the SECURITY DEFINER functions above.
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select to authenticated
using (
  driver_id = auth.uid()
  or exists (select 1 from public.rides r where r.trip_id = trips.id and r.rider_id = auth.uid())
  or public.is_admin()
);

-- A rider sees only their own stops. The full sequence would hand them a
-- stranger's pickup address.
drop policy if exists trip_stops_read on public.trip_stops;
create policy trip_stops_read on public.trip_stops for select to authenticated
using (
  exists (select 1 from public.trips t where t.id = trip_stops.trip_id and t.driver_id = auth.uid())
  or exists (select 1 from public.rides r where r.id = trip_stops.ride_id and r.rider_id = auth.uid())
  or public.is_admin()
);

drop policy if exists occupancy_read on public.occupancy_events;
create policy occupancy_read on public.occupancy_events for select to authenticated
using (
  exists (select 1 from public.rides r
           where r.id = occupancy_events.ride_id
             and (r.rider_id = auth.uid() or r.driver_id = auth.uid()))
  or public.is_admin()
);

drop policy if exists blocklist_own on public.match_blocklist;
create policy blocklist_own on public.match_blocklist for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ###########################################################################
-- 13. REALTIME
-- ###########################################################################

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.trips';      exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.trip_stops'; exception when duplicate_object then null; end;
  end if;
end $$;

-- ###########################################################################
-- 14. BACKFILL
--
-- Every live ride gets the trip it would have had, so the driver screens have
-- a stop sequence to render the moment this migration lands. Completed history
-- is left alone: it has no schedule to reconstruct and nothing reads one.
-- ###########################################################################

do $$
declare r record; v_trip uuid; v_class text; v_cap smallint;
begin
  for r in
    select * from public.rides
     where status in ('accepted','arrived','ongoing')
       and driver_id is not null and trip_id is null
     order by created_at
  loop
    select d.vehicle_class into v_class from public.drivers d where d.user_id = r.driver_id;
    v_class := coalesce(v_class, r.vehicle_type, 'mini');
    select seat_capacity into v_cap from public.vehicle_classes where id = v_class;

    select id into v_trip from public.trips
     where driver_id = r.driver_id and status = 'active';
    if v_trip is null then
      insert into public.trips (driver_id, vehicle_class, seat_capacity, started_at)
      values (r.driver_id, v_class, coalesce(v_cap, 4), coalesce(r.accepted_at, now()))
      returning id into v_trip;
    end if;

    update public.rides set trip_id = v_trip where id = r.id;
    perform public.trip_place_stops(v_trip, r.id);

    if r.status = 'ongoing' then
      update public.trip_stops set reached_at = coalesce(r.started_at, now())
       where trip_id = v_trip and ride_id = r.id and kind = 'pickup';
      update public.rides set seats_occupied = coalesce(seats_occupied, seats) where id = r.id;
    end if;

    perform public.trip_recount(v_trip);
  end loop;
end $$;

-- ###########################################################################
-- 15. SCHEDULED WORK
--
--   select cron.schedule('sweep-empty-trips', '*/5 * * * *',
--     $$ update public.trips set status = 'cancelled', ended_at = now()
--         where status = 'active' and created_at < now() - interval '12 hours'
--           and not exists (select 1 from public.rides r
--                            where r.trip_id = trips.id
--                              and r.status in ('accepted','arrived','ongoing')) $$);
-- ###########################################################################
