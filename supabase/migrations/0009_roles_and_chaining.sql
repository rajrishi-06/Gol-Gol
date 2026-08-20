-- ============================================================================
-- Gol·Gol — one account, two modes (P0) and sequential chaining (P2)
--
-- P0. `users` plus a verified `drivers` row was always a capability model: it
--     says what you *may* do, never what you are doing right now. Nothing
--     stopped the same person being dispatched as a driver while sitting in
--     someone else's back seat. Mode makes that a database invariant rather
--     than something the UI is trusted to prevent.
--
-- P2. Chaining is the other half of "take another fare nearby", and the half a
--     bike can safely have: accept the *next* booking while finishing the
--     current one, with its pickup strictly after every drop still to be made.
--     No two contracts are ever aboard at once, so there is no capacity overlap
--     and nobody already riding is delayed at all.
-- ============================================================================

-- ###########################################################################
-- 1. MODE
-- ###########################################################################

create table if not exists public.user_modes (
  user_id         uuid primary key references public.users (id) on delete cascade,
  mode            text not null default 'idle'
                    check (mode in ('idle','seeking','riding','available','on_trip','heading_home')),
  trip_id         uuid references public.trips (id) on delete set null,
  booking_id      uuid references public.rides (id) on delete set null,
  destination_lat double precision,
  destination_lng double precision,
  changed_at      timestamptz not null default now()
);

create index if not exists idx_user_modes_mode on public.user_modes (mode);

alter table public.user_modes enable row level security;

drop policy if exists user_modes_own on public.user_modes;
create policy user_modes_own on public.user_modes for select to authenticated
using (user_id = auth.uid() or public.is_admin());
-- No client write policy: `set_user_mode` is the only way in, so the invariant
-- below cannot be sidestepped by writing the row directly.

-- The row itself is the invariant the plan called for: user_id is the primary
-- key, so a user cannot be in two modes at once by construction.

create or replace function public.current_mode(p_user uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.mode from public.user_modes m where m.user_id = coalesce(p_user, auth.uid())),
    'idle');
$$;
grant execute on function public.current_mode(uuid) to authenticated;

-- Write the mode without asking the caller to know the transition rules.
create or replace function public.set_mode_row(
  p_user uuid, p_mode text, p_trip uuid default null, p_booking uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_modes (user_id, mode, trip_id, booking_id, changed_at)
  values (p_user, p_mode, p_trip, p_booking, now())
  on conflict (user_id) do update
    set mode = excluded.mode,
        trip_id = excluded.trip_id,
        booking_id = excluded.booking_id,
        changed_at = now();
end;
$$;

-- ── the two refusals ────────────────────────────────────────────────────────

-- You cannot drive while you are someone's passenger.
create or replace function public.assert_can_drive(p_user uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); v_ride uuid;
begin
  select r.id into v_ride
    from public.rides r
   where r.rider_id = u
     and r.status in ('accepted','arrived','ongoing')
   limit 1;
  if v_ride is not null then
    raise exception 'you are riding as a passenger right now' using errcode = '55006';
  end if;
end;
$$;
grant execute on function public.assert_can_drive(uuid) to authenticated;

-- ...and you cannot book a ride while you are driving one.
create or replace function public.assert_can_ride(p_user uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); v_trip uuid;
begin
  select t.id into v_trip
    from public.trips t
   where t.driver_id = u and t.status = 'active'
     and exists (select 1 from public.rides r
                  where r.trip_id = t.id and r.status in ('accepted','arrived','ongoing'))
   limit 1;
  if v_trip is not null then
    raise exception 'you are driving a trip right now' using errcode = '55006';
  end if;
end;
$$;
grant execute on function public.assert_can_ride(uuid) to authenticated;

-- The switch in the header calls this. It is a real transition, not navigation:
-- it refuses when the invariant says no, and the UI surfaces the refusal.
create or replace function public.set_user_mode(
  p_mode text,
  p_dest_lat double precision default null,
  p_dest_lng double precision default null
) returns public.user_modes language plpgsql security definer set search_path = public as $$
declare v_row public.user_modes; v_approved boolean;
begin
  if p_mode not in ('idle','available','heading_home') then
    -- seeking / riding / on_trip are consequences of booking, boarding and
    -- accepting. Letting a client assert them would let it lie about state the
    -- rest of the system reasons from.
    raise exception 'that mode is set by the ride itself, not by hand' using errcode = '22023';
  end if;

  if p_mode in ('available','heading_home') then
    select exists (
      select 1 from public.drivers d
       where d.user_id = auth.uid() and d.verification_status = 'approved'
    ) into v_approved;
    if not v_approved then
      raise exception 'not an approved driver' using errcode = '42501';
    end if;
    perform public.assert_can_drive();
    if p_mode = 'heading_home' and (p_dest_lat is null or p_dest_lng is null) then
      raise exception 'heading home needs a destination' using errcode = '22023';
    end if;
  end if;

  if p_mode = 'idle' then
    -- Stepping off duty is only "idle" if there is nothing in flight.
    perform public.assert_can_ride();
  end if;

  insert into public.user_modes (user_id, mode, destination_lat, destination_lng, changed_at)
  values (auth.uid(), p_mode, p_dest_lat, p_dest_lng, now())
  on conflict (user_id) do update
    set mode = excluded.mode,
        trip_id = null,
        booking_id = null,
        destination_lat = excluded.destination_lat,
        destination_lng = excluded.destination_lng,
        changed_at = now()
  returning * into v_row;

  -- Going on or off duty is the same act as flipping the duty flag; keep the
  -- two from drifting apart.
  update public.active_drivers
     set is_online = (p_mode in ('available','heading_home')), heartbeat_at = now()
   where user_id = auth.uid();

  return v_row;
end;
$$;
grant execute on function public.set_user_mode(text, double precision, double precision) to authenticated;

-- ###########################################################################
-- 2. MODE IS MAINTAINED BY THE FLOW, NOT BY THE CLIENT
--
-- A mode nobody updates is worse than no mode at all: it goes stale and then
-- gets trusted. Every transition that already existed now moves it.
-- ###########################################################################

-- Booking a ride puts the rider in `seeking` — and refuses outright if they are
-- mid-trip as a driver. This is a trigger rather than an RPC because rides are
-- still inserted straight through PostgREST.
create or replace function public.rides_guard_and_mark()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_ride(new.rider_id);
  perform public.set_mode_row(new.rider_id, 'seeking', null, new.id);
  return new;
end;
$$;

drop trigger if exists trg_rides_guard_mode on public.rides;
create trigger trg_rides_guard_mode after insert on public.rides
  for each row execute function public.rides_guard_and_mark();

-- Every status change moves both sides' modes.
create or replace function public.rides_sync_modes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'ongoing' then
    perform public.set_mode_row(new.rider_id, 'riding', new.trip_id, new.id);
  elsif new.status in ('completed','cancelled','expired') then
    -- The rider is only free if they have nothing else in flight.
    if not exists (
      select 1 from public.rides r
       where r.rider_id = new.rider_id and r.id <> new.id
         and r.status in ('pending','scheduled','accepted','arrived','ongoing')
    ) then
      perform public.set_mode_row(new.rider_id, 'idle');
    end if;
  elsif new.status = 'pending' and old.status <> 'pending' then
    perform public.set_mode_row(new.rider_id, 'seeking', null, new.id);
  end if;

  -- Driver side: on a job while anything is live on their trip, back on duty
  -- when the last one closes.
  if new.driver_id is not null then
    if new.status in ('accepted','arrived','ongoing') then
      perform public.set_mode_row(new.driver_id, 'on_trip', new.trip_id, new.id);
    elsif new.status in ('completed','cancelled','expired') then
      if not exists (
        select 1 from public.rides r
         where r.driver_id = new.driver_id
           and r.status in ('accepted','arrived','ongoing')
      ) then
        perform public.set_mode_row(new.driver_id, 'available');
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rides_sync_modes on public.rides;
create trigger trg_rides_sync_modes after update on public.rides
  for each row execute function public.rides_sync_modes();

-- Going on and off duty through the existing control keeps mode in step.
create or replace function public.set_driver_duty(p_online boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.drivers d
     where d.user_id = auth.uid() and d.verification_status = 'approved'
  ) then
    raise exception 'not an approved driver' using errcode = '42501';
  end if;

  if p_online then
    perform public.assert_can_drive();
  end if;

  insert into public.active_drivers (user_id, is_online, heartbeat_at)
  values (auth.uid(), p_online, now())
  on conflict (user_id) do update
    set is_online = excluded.is_online, heartbeat_at = now();

  -- Do not knock someone off a job just because they toggled the switch.
  if public.current_mode() not in ('on_trip','riding','seeking') then
    perform public.set_mode_row(auth.uid(), case when p_online then 'available' else 'idle' end);
  end if;

  return p_online;
end;
$$;
grant execute on function public.set_driver_duty(boolean) to authenticated;

-- Accepting work asserts the invariant at the point it matters.
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride  public.rides;
  v_trip  public.trips;
  v_class text;
  v_cap   smallint;
begin
  perform public.expire_seat_holds();
  perform public.assert_can_drive();

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
    raise exception 'already on a trip — use accept_pooled_ride or accept_chained_ride'
      using errcode = '55006';
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

-- Backfill a mode for everyone who already exists, derived from what they are
-- actually doing rather than defaulted to idle.
insert into public.user_modes (user_id, mode, trip_id, booking_id)
select u.id,
       case
         when exists (select 1 from public.rides r
                       where r.driver_id = u.id and r.status in ('accepted','arrived','ongoing'))
           then 'on_trip'
         when exists (select 1 from public.rides r
                       where r.rider_id = u.id and r.status = 'ongoing') then 'riding'
         when exists (select 1 from public.rides r
                       where r.rider_id = u.id and r.status in ('pending','accepted','arrived'))
           then 'seeking'
         when exists (select 1 from public.active_drivers a
                       where a.user_id = u.id and a.is_online) then 'available'
         else 'idle'
       end,
       (select r.trip_id from public.rides r
         where (r.driver_id = u.id or r.rider_id = u.id)
           and r.status in ('accepted','arrived','ongoing') limit 1),
       (select r.id from public.rides r
         where (r.driver_id = u.id or r.rider_id = u.id)
           and r.status in ('accepted','arrived','ongoing') limit 1)
  from public.users u
on conflict (user_id) do nothing;

-- ###########################################################################
-- 3. SEQUENTIAL CHAINING
--
-- Pooling carries two contracts at once and has to reason about capacity and
-- detour at every stop. Chaining carries them one after another: the new pickup
-- comes strictly after every drop still to be made, so the vehicle is empty
-- when it arrives and nobody already aboard loses a second.
--
-- That is why a bike can do this and can never pool — and why the gates here
-- are so much shorter than `poolable_rides`.
-- ###########################################################################

alter table public.pool_config add column if not exists chain_radius_km numeric not null default 4;
alter table public.pool_config add column if not exists chain_lead_km   numeric not null default 6;

-- How far the vehicle still has to drive before it is free.
create or replace function public.trip_remaining_km(p_trip_id uuid)
returns double precision language plpgsql stable security definer set search_path = public as $$
declare path record;
begin
  select * into path from public.trip_remaining_path(p_trip_id);
  if coalesce(array_length(path.lats, 1), 0) < 2 then return 0; end if;
  return public.path_length_km(path.lats, path.lngs);
end;
$$;

-- The last place this trip has to be: where the driver will be free.
create or replace function public.trip_final_stop(
  p_trip_id uuid, out lat double precision, out lng double precision
) language sql stable security definer set search_path = public as $$
  select s.lat, s.lng from public.trip_stops s
   where s.trip_id = p_trip_id and s.reached_at is null
   order by s.seq desc limit 1;
$$;

-- Requests a driver could take *next*, offered while they finish the current one.
--
-- Deliberately not the pooling funnel: there is no corridor, no detour cap and
-- no consent gate, because nothing about this affects the rider already aboard.
-- What matters is that the driver is nearly done and the new pickup is close to
-- where they will end up.
create or replace function public.chainable_rides(p_limit integer default 5)
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
  pickup_from_drop_km numeric,
  free_in_min  integer,
  held_until   timestamptz,
  created_at   timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_trip   public.trips;
  cfg      public.pool_config;
  fin      record;
  left_km  double precision;
begin
  perform public.expire_seat_holds();

  select t.* into v_trip from public.trips t
   where t.driver_id = auth.uid() and t.status = 'active';
  if v_trip.id is null then return; end if;

  select * into cfg from public.pool_config where id;

  if not exists (
    select 1 from public.vehicle_classes vc
     where vc.id = v_trip.vehicle_class and vc.allows_chaining
  ) then
    return;
  end if;

  -- Only offered on the last leg: an accepted-but-unstarted booking still ahead
  -- of us means the driver has more than one thing left to think about.
  if exists (
    select 1 from public.rides r
     where r.trip_id = v_trip.id and r.status in ('accepted','arrived')
  ) then
    return;
  end if;

  left_km := public.trip_remaining_km(v_trip.id);
  if left_km > cfg.chain_lead_km then return; end if;   -- too early to line up the next one

  select * into fin from public.trip_final_stop(v_trip.id);
  if fin.lat is null then return; end if;

  return query
  select r.id, u.name, r.from_address, r.to_address,
         r.from_lat, r.from_lng, r.to_lat, r.to_lng,
         r.seats, r.fare, r.distance_km,
         round(public.haversine_km(fin.lat, fin.lng, r.from_lat, r.from_lng)::numeric, 2),
         ceil((left_km + public.haversine_km(fin.lat, fin.lng, r.from_lat, r.from_lng))
              * cfg.road_factor / cfg.avg_speed_kmh * 60)::integer,
         (select h.expires_at from public.seat_holds h
           where h.ride_id = r.id and h.driver_id = auth.uid() and h.expires_at > now()),
         r.created_at
    from public.rides r
    join public.users u on u.id = r.rider_id
   where r.status = 'pending'
     and r.driver_id is null
     and r.trip_id is null
     and r.rider_id <> auth.uid()
     and r.vehicle_type = v_trip.vehicle_class
     and r.seats <= v_trip.seat_capacity
     and coalesce(r.scheduled_for, now()) <= now() + interval '10 minutes'
     and public.haversine_km(fin.lat, fin.lng, r.from_lat, r.from_lng) <= cfg.chain_radius_km
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
   order by public.haversine_km(fin.lat, fin.lng, r.from_lat, r.from_lng)
   limit greatest(1, p_limit);
end;
$$;
grant execute on function public.chainable_rides(integer) to authenticated;

-- Take the next fare onto the end of the current trip.
--
-- The one gate that makes this *sequential* rather than concurrent: the new
-- pickup must sort after every stop still to be made. `trip_place_stops` orders
-- by progress along the remaining route, so a pickup beyond the final drop lands
-- last on its own — and the capacity walk then sees every seat released before
-- any is taken again, which is what lets a one-seat bike do this at all.
create or replace function public.accept_chained_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride public.rides;
  v_trip public.trips;
  cfg    public.pool_config;
  fin    record;
  gap_km double precision;
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
     where vc.id = v_trip.vehicle_class and vc.allows_chaining
  ) then
    raise exception 'this vehicle class cannot chain' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.rides r
     where r.trip_id = v_trip.id and r.status in ('accepted','arrived')
  ) then
    raise exception 'you already have a booking waiting' using errcode = '55006';
  end if;

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

  if v_ride.vehicle_type is distinct from v_trip.vehicle_class then
    raise exception 'wrong vehicle class' using errcode = '22023';
  end if;
  if v_ride.seats > v_trip.seat_capacity then
    raise exception 'that booking needs % seats', v_ride.seats using errcode = '23514';
  end if;

  select * into fin from public.trip_final_stop(v_trip.id);
  if fin.lat is null then
    raise exception 'trip has no remaining stops' using errcode = '22023';
  end if;

  gap_km := public.haversine_km(fin.lat, fin.lng, v_ride.from_lat, v_ride.from_lng);
  if gap_km > cfg.chain_radius_km then
    raise exception 'that pickup is % km from where you finish', round(gap_km::numeric, 1)
      using errcode = '22023';
  end if;

  update public.rides
     set status = 'accepted', driver_id = auth.uid(), accepted_at = now(),
         trip_id = v_trip.id
   where id = p_ride_id
  returning * into v_ride;

  delete from public.seat_holds where ride_id = p_ride_id;

  perform public.trip_place_stops(v_trip.id, v_ride.id);
  perform public.trip_recount(v_trip.id);
  perform public.trip_assert_capacity(v_trip.id);

  insert into public.ride_events (ride_id, actor_id, status, note, meta)
  values (p_ride_id, auth.uid(), 'accepted', 'queued as the next fare',
          jsonb_build_object('trip_id', v_trip.id, 'chained', true,
                             'gap_km', round(gap_km::numeric, 2)));

  return v_ride;
end;
$$;
grant execute on function public.accept_chained_ride(uuid) to authenticated;

-- Holding works for a chained offer too, so the card a driver sees is one they
-- can take. The seat-availability test is the only part that differs: a chained
-- booking needs a seat when it *starts*, by which point the vehicle is empty.
create or replace function public.hold_chain_seat(p_ride_id uuid)
returns table (hold_id uuid, expires_at timestamptz, seconds integer)
language plpgsql security definer set search_path = public as $$
declare v_trip public.trips; v_ride public.rides; cfg public.pool_config;
        v_hold public.seat_holds; v_exp timestamptz;
begin
  perform public.expire_seat_holds();
  select * into cfg from public.pool_config where id;

  select t.* into v_trip from public.trips t
   where t.driver_id = auth.uid() and t.status = 'active' for update;
  if v_trip.id is null then return; end if;

  select r.* into v_ride from public.rides r where r.id = p_ride_id for update;
  if v_ride.id is null or v_ride.status <> 'pending' or v_ride.driver_id is not null then
    return;
  end if;
  if v_ride.vehicle_type is distinct from v_trip.vehicle_class
     or v_ride.seats > v_trip.seat_capacity then
    return;
  end if;

  select * into v_hold from public.seat_holds where ride_id = p_ride_id;
  if v_hold.id is not null and v_hold.driver_id <> auth.uid() then return; end if;

  v_exp := now() + make_interval(secs => cfg.hold_seconds);
  insert into public.seat_holds (trip_id, ride_id, driver_id, seats, expires_at)
  values (v_trip.id, p_ride_id, auth.uid(), v_ride.seats, v_exp)
  on conflict (ride_id) do update
    set expires_at = excluded.expires_at, trip_id = excluded.trip_id, seats = excluded.seats
  returning * into v_hold;

  return query select v_hold.id, v_hold.expires_at, cfg.hold_seconds;
end;
$$;
grant execute on function public.hold_chain_seat(uuid) to authenticated;

-- A chained hold reserves the *next* leg, not a seat on the current one, so it
-- must not count against the seats the pooling maths is allocating right now.
create or replace function public.trip_seats_held(p_trip_id uuid, p_except_ride uuid default null)
returns smallint language sql stable as $$
  select coalesce(sum(h.seats), 0)::smallint
    from public.seat_holds h
    join public.rides r on r.id = h.ride_id
   where h.trip_id = p_trip_id
     and h.expires_at > now()
     and (p_except_ride is null or h.ride_id <> p_except_ride)
     -- a hold whose pickup is past the last drop is the next leg, not this one
     and not exists (
       select 1 from public.trip_stops s
        where s.trip_id = p_trip_id and s.ride_id = h.ride_id
     );
$$;

-- ###########################################################################
-- 4. COUNTERS MEAN "HOW FULL DOES IT GET", NOT "HOW MANY ARE QUEUED"
--
-- 0007 summed every live booking into `seats_booked`, which is right when the
-- spans overlap — that is what pooling is. Chaining queues bookings that never
-- overlap, so a one-seat bike carrying one rider with one more queued summed to
-- 2 and tripped `trips_seats_sane`.
--
-- The honest figure is the peak occupancy over the route: identical to the sum
-- when spans overlap, and the largest single booking when they do not.
-- ###########################################################################

create or replace function public.trip_recount(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_aboard  integer := 0;
  v_running integer;
  v_peak    integer;
  s         record;
begin
  -- who is in the vehicle right now
  select coalesce(sum(greatest(r.seats, coalesce(r.seats_occupied, r.seats))), 0)
    into v_aboard
    from public.rides r
   where r.trip_id = p_trip_id and r.status = 'ongoing';

  -- then walk what is left, tracking the high-water mark
  v_running := v_aboard;
  v_peak    := v_aboard;
  for s in
    select seat_delta from public.trip_stops
     where trip_id = p_trip_id and reached_at is null order by seq
  loop
    v_running := v_running + s.seat_delta;
    if v_running > v_peak then v_peak := v_running; end if;
  end loop;

  update public.trips
     set seats_booked   = greatest(0, v_peak),
         seats_occupied = greatest(0, v_aboard)
   where id = p_trip_id;
end;
$$;

-- `seats_booked` is now peak demand along the route, which can legitimately sit
-- above the vehicle for the instant between a driver reporting a bigger
-- headcount and the re-dispatch that resolves it. `trip_assert_capacity` is the
-- check that actually enforces the vehicle, and it raises; this constraint was
-- only ever a backstop against nonsense.
alter table public.trips drop constraint if exists trips_seats_sane;
alter table public.trips add constraint trips_seats_sane check (
  seats_booked   >= 0 and
  seats_occupied between 0 and seat_capacity
);
