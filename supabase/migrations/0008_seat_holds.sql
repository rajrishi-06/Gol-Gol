-- ============================================================================
-- Gol·Gol — seat holds, and the detour promise audited to settlement
--
-- Two gaps left open by 0007:
--
--   1. An offer did not reserve anything. The row lock in `accept_pooled_ride`
--      kept the vehicle from ever being oversold, but a driver could be shown
--      an offer that failed the moment they tapped it — correct, and unpleasant.
--      A hold now reserves the seat *and* the request for a short window.
--
--   2. `promised_detour_min` was quoted and capped at insertion, but never
--      compared against what the trip actually cost the rider. A promise nobody
--      audits is a promise nobody keeps, so completion now measures it and
--      credits the rider automatically when it was broken.
-- ============================================================================

-- ###########################################################################
-- 1. SEAT HOLDS
-- ###########################################################################

alter table public.pool_config add column if not exists hold_seconds integer not null default 25;

create table if not exists public.seat_holds (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  ride_id    uuid not null references public.rides (id) on delete cascade,
  driver_id  uuid not null references public.users (id) on delete cascade,
  seats      smallint not null check (seats between 1 and 6),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- One live hold per request: whoever gets here first is the only driver who
  -- can accept it until the window closes.
  unique (ride_id)
);

create index if not exists idx_seat_holds_trip on public.seat_holds (trip_id);
create index if not exists idx_seat_holds_live on public.seat_holds (expires_at);

alter table public.seat_holds enable row level security;

-- Readable by the driver holding it and the rider being held for; never
-- writable from a client — `hold_pool_seat` is the only way in.
drop policy if exists seat_holds_read on public.seat_holds;
create policy seat_holds_read on public.seat_holds for select to authenticated
using (
  driver_id = auth.uid()
  or exists (select 1 from public.rides r where r.id = seat_holds.ride_id and r.rider_id = auth.uid())
  or public.is_admin()
);

-- Sweep expired holds. Cheap enough to call from any read path, so no caller
-- ever has to reason about whether the sweeper has run recently.
create or replace function public.expire_seat_holds()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.seat_holds where expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.expire_seat_holds() to authenticated;

-- Seats held on a trip by holds that are still live.
create or replace function public.trip_seats_held(p_trip_id uuid, p_except_ride uuid default null)
returns smallint language sql stable as $$
  select coalesce(sum(h.seats), 0)::smallint
    from public.seat_holds h
   where h.trip_id = p_trip_id
     and h.expires_at > now()
     and (p_except_ride is null or h.ride_id <> p_except_ride);
$$;

-- 0007's one-argument form must go before the two-argument form is created:
-- a defaulted second parameter makes an *overload*, and a one-argument call
-- would then be ambiguous rather than resolving to the new definition.
drop function if exists public.trip_seats_available(uuid);

-- Availability now nets off live holds as well as live bookings. `p_except_ride`
-- lets a caller ask "would this fit, ignoring my own hold on it?", which is what
-- accept has to ask — otherwise a driver's own hold locks them out.
create or replace function public.trip_seats_available(p_trip_id uuid, p_except_ride uuid default null)
returns smallint language sql stable as $$
  select greatest(0, t.seat_capacity
                   - public.trip_seats_committed(p_trip_id)
                   - public.trip_seats_held(p_trip_id, p_except_ride))::smallint
    from public.trips t where t.id = p_trip_id;
$$;

-- ###########################################################################
-- 2. TAKING AND RELEASING A HOLD
-- ###########################################################################

-- Reserve a seat and the request itself for `hold_seconds`.
--
-- Everything `accept_pooled_ride` will later re-check is checked here first, so
-- an offer that reaches the driver's screen is one they can actually take. The
-- trip row is locked for the same reason it is on accept: two dispatchers
-- reaching for the last seat must serialise.
create or replace function public.hold_pool_seat(p_ride_id uuid)
returns table (hold_id uuid, expires_at timestamptz, seconds integer)
language plpgsql security definer set search_path = public as $$
declare
  v_trip public.trips;
  v_ride public.rides;
  cfg    public.pool_config;
  v_free smallint;
  v_hold public.seat_holds;
  v_exp  timestamptz;
begin
  perform public.expire_seat_holds();
  select * into cfg from public.pool_config where id;

  select t.* into v_trip from public.trips t
   where t.driver_id = auth.uid() and t.status = 'active'
     for update;
  if v_trip.id is null then
    raise exception 'no active trip' using errcode = '55006';
  end if;

  select r.* into v_ride from public.rides r where r.id = p_ride_id for update;
  if v_ride.id is null or v_ride.status <> 'pending' or v_ride.driver_id is not null then
    return;                                          -- taken, or never existed
  end if;
  if not v_ride.shareable or v_ride.vehicle_type is distinct from v_trip.vehicle_class then
    return;
  end if;

  -- Someone else may already be holding this request.
  select * into v_hold from public.seat_holds where ride_id = p_ride_id;
  if v_hold.id is not null and v_hold.driver_id <> auth.uid() then
    return;
  end if;

  v_free := public.trip_seats_available(v_trip.id, p_ride_id);
  if v_ride.seats > v_free then
    return;
  end if;

  v_exp := now() + make_interval(secs => cfg.hold_seconds);

  insert into public.seat_holds (trip_id, ride_id, driver_id, seats, expires_at)
  values (v_trip.id, p_ride_id, auth.uid(), v_ride.seats, v_exp)
  on conflict (ride_id) do update
    set expires_at = excluded.expires_at,      -- the same driver may extend
        trip_id    = excluded.trip_id,
        seats      = excluded.seats
  returning * into v_hold;

  return query select v_hold.id, v_hold.expires_at, cfg.hold_seconds;
end;
$$;
grant execute on function public.hold_pool_seat(uuid) to authenticated;

-- Give a held seat back — the driver dismissed the offer, or moved on.
create or replace function public.release_seat_hold(p_ride_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.seat_holds
   where ride_id = p_ride_id and driver_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
grant execute on function public.release_seat_hold(uuid) to authenticated;

-- ###########################################################################
-- 3. MATCHING AND ACCEPT, NOW HOLD-AWARE
-- ###########################################################################

-- Same funnel as 0007, with two changes: a request another driver is holding is
-- not offered, and free seats are net of live holds.
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
       -- somebody else is mid-decision on this request
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
  )
  select s.id, u.name, s.from_address, s.to_address,
         s.from_lat, s.from_lng, s.to_lat, s.to_lng,
         s.seats, s.fare, s.distance_km,
         round(s.p_off::numeric, 2), round(s.d_off::numeric, 2),
         round(s.add_km::numeric, 2),
         ceil(s.add_km * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer,
         ceil(s.p_prog * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer,
         s.mine_until,
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

-- Accept consumes the caller's own hold. The re-checks under the lock stay
-- exactly as they were — a hold makes failure rare, it does not make the
-- recheck optional, because occupancy can still grow underneath it.
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
  perform public.expire_seat_holds();
  select * into cfg from public.pool_config where id;

  select t.* into v_trip from public.trips t
   where t.driver_id = auth.uid() and t.status = 'active'
     for update;
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

  -- Another driver's live hold outranks us even if a seat looks free.
  if exists (
    select 1 from public.seat_holds h
     where h.ride_id = p_ride_id and h.driver_id <> auth.uid() and h.expires_at > now()
  ) then
    raise exception 'another driver is taking that ride' using errcode = '55006';
  end if;

  select * into v_ride from public.rides
   where id = p_ride_id and status = 'pending' and driver_id is null
     for update;
  if v_ride.id is null then return null; end if;
  if not v_ride.shareable then
    raise exception 'that rider did not opt into sharing' using errcode = '22023';
  end if;
  if v_ride.vehicle_type is distinct from v_trip.vehicle_class then
    raise exception 'wrong vehicle class' using errcode = '22023';
  end if;

  -- Our own hold must not count against us.
  free := public.trip_seats_available(v_trip.id, p_ride_id);
  if v_ride.seats > free then
    raise exception 'only % seat(s) left', free using errcode = '23514';
  end if;

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

  update public.rides
     set pooled = true,
         promised_detour_min = greatest(
           coalesce(promised_detour_min, 0),
           ceil(add_km * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer)
   where trip_id = v_trip.id
     and status in ('accepted','arrived','ongoing');

  -- the hold has done its job
  delete from public.seat_holds where ride_id = p_ride_id;

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

-- Solo dispatch must respect a hold too, or the request a pooling driver is
-- deciding on could be taken out from under them by a driver on the dashboard.
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
     and not exists (
       select 1 from public.seat_holds h
        where h.ride_id = r.id and h.driver_id <> auth.uid() and h.expires_at > now()
     )
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

-- Solo accept: the same courtesy, so a held request cannot be sniped.
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride  public.rides;
  v_trip  public.trips;
  v_class text;
  v_cap   smallint;
begin
  perform public.expire_seat_holds();

  select d.vehicle_class into v_class
    from public.drivers d
   where d.user_id = auth.uid() and d.verification_status = 'approved';
  if v_class is null then
    raise exception 'not an approved driver' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.trips t
     where t.driver_id = auth.uid() and t.status = 'active'
       and exists (select 1 from public.rides r
                    where r.trip_id = t.id and r.status in ('accepted','arrived','ongoing'))
  ) then
    raise exception 'already on a trip — use accept_pooled_ride' using errcode = '55006';
  end if;

  if exists (
    select 1 from public.seat_holds h
     where h.ride_id = p_ride_id and h.driver_id <> auth.uid() and h.expires_at > now()
  ) then
    raise exception 'another driver is taking that ride' using errcode = '55006';
  end if;

  select seat_capacity into v_cap from public.vehicle_classes where id = v_class;

  update public.rides
     set status = 'accepted', driver_id = auth.uid(), accepted_at = now()
   where id = p_ride_id and status = 'pending' and driver_id is null
  returning * into v_ride;
  if v_ride.id is null then return null; end if;

  select * into v_trip from public.trips
   where driver_id = auth.uid() and status = 'active' limit 1;
  if v_trip.id is null then
    insert into public.trips (driver_id, vehicle_class, seat_capacity, started_at)
    values (auth.uid(), v_class, coalesce(v_cap, 1), now())
    returning * into v_trip;
  end if;

  update public.rides set trip_id = v_trip.id where id = v_ride.id
  returning * into v_ride;

  delete from public.seat_holds where ride_id = p_ride_id;

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

-- ###########################################################################
-- 4. THE DETOUR PROMISE, MEASURED AND PAID
-- ###########################################################################

alter table public.rides add column if not exists breach_credit numeric not null default 0;
alter table public.pool_config add column if not exists breach_rate_per_min numeric not null default 8;
alter table public.pool_config add column if not exists breach_cap_pct integer not null default 25;

-- Baseline: what this trip would have taken alone. Stored at booking, because
-- without it nothing downstream is provable.
create or replace function public.rides_set_fare()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg record; pcfg public.pool_config; one_seat numeric;
begin
  new.distance_km := round(public.haversine_km(new.from_lat, new.from_lng, new.to_lat, new.to_lng)::numeric, 2);
  select * into cfg  from public.fare_config where vehicle_type = new.vehicle_type;
  select * into pcfg from public.pool_config where id;

  if found then
    one_seat  := (cfg.base_fare + new.distance_km * cfg.per_km) * coalesce(new.surge_multiplier, 1);
    new.fare  := public.seat_fare(one_seat, new.seats);
    new.seat_surcharge := new.fare - ceil(one_seat);
  end if;

  new.solo_eta_min := ceil(new.distance_km * pcfg.road_factor / pcfg.avg_speed_kmh * 60)::integer;

  if new.vehicle_type = 'bike' then
    new.seats := 1;
    new.shareable := false;
  end if;

  new.start_otp := null;
  if new.scheduled_for is not null and new.scheduled_for > now() + interval '2 minutes' then
    new.status := 'scheduled';
  end if;
  return new;
end;
$$;

-- How much longer the rider's journey actually was.
--
-- Measured from the stops the vehicle actually drove between their pickup and
-- their drop — *not* from wall-clock time. Wall-clock would charge us for
-- traffic we did not cause and would breach on nearly every trip in a city,
-- which would make the guarantee meaningless in the direction that costs money.
-- The promise was about the detour we imposed, so that is what is measured.
create or replace function public.ride_actual_detour_min(p_ride_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  r        public.rides;
  cfg      public.pool_config;
  p_seq    smallint;
  d_seq    smallint;
  lats     double precision[];
  lngs     double precision[];
  ridden   double precision;
  direct   double precision;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.trip_id is null then return 0; end if;
  select * into cfg from public.pool_config where id;

  select seq into p_seq from public.trip_stops
   where trip_id = r.trip_id and ride_id = p_ride_id and kind = 'pickup';
  select seq into d_seq from public.trip_stops
   where trip_id = r.trip_id and ride_id = p_ride_id and kind = 'drop';
  if p_seq is null or d_seq is null then return 0; end if;

  select array_agg(s.lat order by s.seq), array_agg(s.lng order by s.seq)
    into lats, lngs
    from public.trip_stops s
   where s.trip_id = r.trip_id and s.seq between p_seq and d_seq;

  ridden := public.path_length_km(lats, lngs);
  direct := coalesce(r.distance_km, 0);
  if ridden <= direct then return 0; end if;

  return ceil((ridden - direct) * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer;
end;
$$;

-- Completion, now settling the promise as well as the fare.
create or replace function public.complete_ride(p_ride_id uuid, p_waiting_minutes integer default 0)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride public.rides; cfg record; pcfg public.pool_config;
  v_base numeric := 0; v_dist numeric := 0; v_surge numeric := 0;
  v_wait numeric := 0; v_seat numeric := 0; v_disc numeric := 0;
  v_total numeric := 0; v_platform numeric := 0; v_billed smallint;
  v_remaining integer; v_actual integer := 0; v_over integer := 0; v_credit numeric := 0;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then raise exception 'ride not found'; end if;
  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'only the assigned driver can complete this ride' using errcode = '42501';
  end if;
  if v_ride.status <> 'ongoing' then return v_ride; end if;

  select * into cfg  from public.fare_config where vehicle_type = v_ride.vehicle_type;
  select * into pcfg from public.pool_config where id;

  v_billed  := greatest(v_ride.seats, coalesce(v_ride.seats_occupied, v_ride.seats));
  v_base    := coalesce(cfg.base_fare, 0);
  v_dist    := round(coalesce(v_ride.distance_km, 0) * coalesce(cfg.per_km, 0), 2);
  v_surge   := round((v_base + v_dist) * (coalesce(v_ride.surge_multiplier, 1) - 1), 2);
  v_seat    := round((v_base + v_dist + v_surge) * (v_billed - 1) * pcfg.extra_seat_pct / 100.0, 2);
  v_wait    := greatest(0, coalesce(p_waiting_minutes, 0) - 3) * 2;

  if v_ride.pooled then
    v_disc := round((v_base + v_dist + v_surge + v_seat) * pcfg.pool_discount_pct / 100.0, 2);
  end if;

  -- Mark the drop reached before measuring, so the stop range is complete.
  if v_ride.trip_id is not null then
    update public.trip_stops set reached_at = now()
     where trip_id = v_ride.trip_id and ride_id = p_ride_id and kind = 'drop';
  end if;

  -- Did we keep the promise? Breaches are credited without a support ticket:
  -- a guarantee that needs chasing is not a guarantee.
  if v_ride.pooled and v_ride.promised_detour_min is not null then
    v_actual := public.ride_actual_detour_min(p_ride_id);
    v_over   := greatest(0, v_actual - v_ride.promised_detour_min);
    if v_over > 0 then
      v_credit := least(
        round((v_base + v_dist + v_surge + v_seat) * pcfg.breach_cap_pct / 100.0, 2),
        round(v_over * pcfg.breach_rate_per_min, 2)
      );
    end if;
  end if;

  v_total    := greatest(0, ceil(v_base + v_dist + v_surge + v_seat + v_wait - v_disc - v_credit));
  v_platform := round(v_total * 0.15, 2);

  update public.rides
     set status = 'completed',
         completed_at = now(),
         final_fare = v_total,
         seat_surcharge = v_seat,
         pool_discount = v_disc,
         actual_detour_min = v_actual,
         breach_credit = v_credit,
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

  -- The driver is paid for the trip they drove; the credit is ours, not theirs.
  if v_credit > 0 then
    insert into public.ride_events (ride_id, status, note, meta)
    values (p_ride_id, 'completed', 'sharing detour ran long — credit applied',
            jsonb_build_object('promised_min', v_ride.promised_detour_min,
                               'actual_min', v_actual, 'credit', v_credit));

    insert into public.notifications (user_id, type, title, body, url, data)
    values (v_ride.rider_id, 'ride', 'We took longer than promised',
            'Your shared ride ran ' || v_over || ' min past what we quoted, so we took ₹'
              || v_credit::text || ' off the fare.',
            '/activity/' || p_ride_id::text,
            jsonb_build_object('ride_id', p_ride_id, 'credit', v_credit));
  end if;

  if v_ride.trip_id is not null then
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

-- ###########################################################################
-- 5. HEADCOUNT VS HOLDS
--
-- When a rider turns up with more people than booked, a merely *held* seat must
-- give way before an accepted booking does: nobody has been promised anything
-- yet, so dropping the hold costs a driver a decision, while displacing a
-- booking costs a rider their ride.
-- ###########################################################################

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

    -- Holds go first: an offer nobody has taken yet costs least to withdraw.
    select greatest(0, public.trip_seats_committed(t.id) + public.trip_seats_held(t.id) - t.seat_capacity)
      into v_over from public.trips t where t.id = v_trip.id;
    if coalesce(v_over, 0) > 0 then
      delete from public.seat_holds where trip_id = v_trip.id;
    end if;

    -- Only then does an accepted booking lose its seat.
    select greatest(0, public.trip_seats_committed(t.id) - t.seat_capacity)
      into v_over from public.trips t where t.id = v_trip.id;

    if coalesce(v_over, 0) > 0 then
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

-- ###########################################################################
-- 6. SCHEDULED WORK
--
--   select cron.schedule('expire-seat-holds', '* * * * *',
--     $$ select public.expire_seat_holds() $$);
--
-- Holds also expire lazily on every read path, so the job is a tidy-up rather
-- than a correctness requirement.
-- ###########################################################################
