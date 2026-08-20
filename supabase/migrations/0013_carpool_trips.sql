-- ============================================================================
-- Gol·Gol — carpool rides become real, tracked trips
--
-- The published-carpool path has been half a feature since 0001. A driver
-- publishes a route, riders request seats, the driver accepts — and then
-- nothing. Acceptance appended a JSON object to `published_rides.accepted_riders`
-- and sent a notification. There was no `rides` row, so there was no trip, no
-- stop sequence, no live tracking, no boarding OTP, no fare on the rider's
-- account, no receipt, no rating, and no record in either party's history. Two
-- strangers were introduced and left to sort out the actual journey themselves.
--
-- It was deferred because turning an accepted match into a live multi-stop trip
-- needed a trip engine. 0007–0012 built one for instant pooling — trips, stops
-- ordered by progress along the route, occupancy accounting, capacity asserts,
-- displacement, drop verification. This migration points the carpool path at
-- that engine instead of building a second one.
--
-- It also closes a leak found on the way in: `published_rides` was readable by
-- any signed-in user, and `accepted_riders` carries each accepted rider's name
-- and mobile number. Section 9 narrows it.
--
-- What changes for a driver: accepting a seat request now creates a booking on
-- their trip, and the request is refused if the rider's pickup or drop is off
-- the route they published. What changes for a rider: an accepted request is a
-- real ride — it appears in Activity, it can be tracked live, it has a boarding
-- code, and it is charged at the per-seat price that was advertised.
-- ============================================================================

-- ###########################################################################
-- 1. A fare that the meter must not touch
--
-- A carpool seat is sold at a price the driver published and the rider agreed
-- to before the vehicle moved. Both fare paths — the BEFORE INSERT trigger and
-- `reprice_ride` at boarding — recompute from distance and headcount, which is
-- right for a hailed ride and wrong for this one. `fare_locked` opts a booking
-- out of both. Nothing else in the schema may set it; it is written once by
-- `accept_ride_request` and never updated.
-- ###########################################################################

alter table public.rides
  add column if not exists fare_locked boolean not null default false;

alter table public.rides
  add column if not exists published_ride_id uuid
    references public.published_rides (id) on delete set null;

create index if not exists idx_rides_published on public.rides (published_ride_id)
  where published_ride_id is not null;

create or replace function public.rides_set_fare()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg record; pcfg public.pool_config; one_seat numeric;
begin
  new.distance_km := round(public.haversine_km(new.from_lat, new.from_lng, new.to_lat, new.to_lng)::numeric, 2);
  select * into cfg  from public.fare_config where vehicle_type = new.vehicle_type;
  select * into pcfg from public.pool_config where id;

  -- A published carpool seat carries its own agreed price.
  if found and not new.fare_locked then
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

create or replace function public.reprice_ride(p_ride_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare r public.rides; cfg record; one_seat numeric; billed smallint; new_fare numeric;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null then return null; end if;
  -- The agreed seat price stands however many people got in.
  if r.fare_locked then return r.fare; end if;
  select * into cfg from public.fare_config where vehicle_type = r.vehicle_type;
  if not found then return r.fare; end if;

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
-- 2. A trip knows where it began, not only where the driver is now
--
-- `trip_remaining_path` seeds the route with the driver's live position. That
-- works for a hail, where a trip only exists because a driver on the road
-- accepted something. A published carpool trip exists from the moment the first
-- seat is sold, which may be days before departure and long before the driver
-- is online — leaving the path with a single point and every corridor test
-- failing for want of a route. The published origin is the missing seed.
-- ###########################################################################

-- A published trip exists from the first seat sold, which may be days before
-- departure. `idx_trips_one_active_per_driver` allows a driver exactly one
-- `active` trip — rightly, since two would mean two vehicles — so a carpool
-- trip sold in advance cannot be born active without locking the driver out of
-- every other job until it departs. It waits as `scheduled` instead.
alter table public.trips drop constraint if exists trips_status_check;
alter table public.trips
  add constraint trips_status_check
  check (status in ('scheduled','active','completed','cancelled'));

alter table public.trips
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists published_ride_id uuid
    references public.published_rides (id) on delete set null;

create unique index if not exists idx_trips_published on public.trips (published_ride_id)
  where published_ride_id is not null;

create or replace function public.trip_remaining_path(
  p_trip_id uuid,
  out lats double precision[], out lngs double precision[]
) language plpgsql stable as $$
declare d record; t record;
begin
  select tr.origin_lat, tr.origin_lng, tr.destination_lat, tr.destination_lng,
         tr.started_at
    into t
    from public.trips tr where tr.id = p_trip_id;

  select a.current_lat, a.current_lng into d
    from public.active_drivers a
    join public.trips tr on tr.driver_id = a.user_id
   where tr.id = p_trip_id;

  lats := '{}'; lngs := '{}';
  -- Where the vehicle is, or — before it has moved or reported — where the
  -- route says it starts.
  if d.current_lat is not null then
    lats := array_append(lats, d.current_lat);
    lngs := array_append(lngs, d.current_lng);
  elsif t.origin_lat is not null then
    lats := array_append(lats, t.origin_lat);
    lngs := array_append(lngs, t.origin_lng);
  end if;

  select array_cat(lats, array_agg(s.lat order by s.seq)),
         array_cat(lngs, array_agg(s.lng order by s.seq))
    into lats, lngs
    from public.trip_stops s
   where s.trip_id = p_trip_id and s.reached_at is null;

  if t.destination_lat is not null then
    lats := array_append(lats, t.destination_lat);
    lngs := array_append(lngs, t.destination_lng);
  end if;
end;
$$;

-- ###########################################################################
-- 3. Booking a seat is booking a seat, not declaring yourself to be looking
--
-- `trg_rides_guard_mode` fires on every insert and puts the rider into
-- `seeking`. That is right for a hail, whose whole point is that no driver has
-- been found. A carpool booking arrives with its driver already attached, and a
-- scheduled one may be a week out; either way the rider is not standing on a
-- kerb waiting, and marking them `seeking` would block them from hailing a ride
-- in the meantime.
-- ###########################################################################

create or replace function public.rides_guard_and_mark()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_ride(new.rider_id);
  if new.driver_id is null and new.status = 'pending' then
    perform public.set_mode_row(new.rider_id, 'seeking', null, new.id);
  end if;
  return new;
end;
$$;

-- ###########################################################################
-- 4. How far off a published route a seat request may sit
--
-- Deliberately looser than instant pooling. A hail is matched against riders
-- already aboard who were promised a journey time; a carpool is planned, the
-- seats are sold in advance, and the only person inconvenienced by a wider
-- corridor is the driver who chose to accept it.
-- ###########################################################################

alter table public.pool_config
  add column if not exists carpool_corridor_km      double precision not null default 5.0,
  add column if not exists carpool_max_extension_km double precision not null default 10.0;

-- ###########################################################################
-- 5. The trip behind a published ride
-- ###########################################################################

alter table public.published_rides
  add column if not exists trip_id uuid references public.trips (id) on delete set null;

alter table public.ride_requests
  add column if not exists ride_id uuid references public.rides (id) on delete set null;

/**
 * Find or create the trip that carries a published ride.
 *
 * Capacity is the seats the driver offered plus the seats already sold, which
 * is the vehicle's carpool capacity however many have gone since. It is not
 * taken from `vehicle_classes`: a driver may publish three seats in a five-seat
 * car because two are already spoken for by people the app never sees.
 */
create or replace function public.carpool_trip(p_published_ride_id uuid)
returns public.trips language plpgsql security definer set search_path = public as $$
declare v_pub public.published_rides; v_trip public.trips; v_class text; v_cap smallint;
begin
  select * into v_pub from public.published_rides where id = p_published_ride_id;
  if v_pub.id is null then
    raise exception 'no such published ride' using errcode = '22023';
  end if;

  select * into v_trip from public.trips
   where published_ride_id = p_published_ride_id for update;
  if v_trip.id is not null then return v_trip; end if;

  select d.vehicle_class into v_class from public.drivers d where d.user_id = v_pub.driver_id;

  v_cap := greatest(
    1,
    coalesce(v_pub.available_seats, 0)
      + coalesce((select sum(coalesce((e->>'seats')::int, 0))
                    from jsonb_array_elements(v_pub.accepted_riders) e), 0)
  )::smallint;

  insert into public.trips (driver_id, vehicle_class, seat_capacity, published_ride_id,
                            origin_lat, origin_lng, destination_lat, destination_lng, status)
  values (v_pub.driver_id, coalesce(v_class, 'sedan'), v_cap, p_published_ride_id,
          v_pub.from_lat, v_pub.from_lng, v_pub.to_lat, v_pub.to_lng, 'scheduled')
  returning * into v_trip;

  update public.published_rides set trip_id = v_trip.id, updated_at = now()
   where id = p_published_ride_id;

  return v_trip;
end;
$$;
grant execute on function public.carpool_trip(uuid) to authenticated;

-- ###########################################################################
-- 6. Accepting a seat request creates the journey
-- ###########################################################################

create or replace function public.accept_ride_request(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_req   public.ride_requests;
  v_pub   public.published_rides;
  v_rider public.users;
  v_trip  public.trips;
  v_ride  public.rides;
  cfg     public.pool_config;
  path    record;
  p_loc   record;
  d_loc   record;
  p_prog  double precision;
  d_prog  double precision;
  path_km double precision;
  v_from_lat double precision; v_from_lng double precision;
  v_to_lat   double precision; v_to_lng   double precision;
  v_seats smallint;
begin
  select * into cfg from public.pool_config where id;

  select * into v_req from public.ride_requests where id = p_request_id for update;
  if v_req.id is null then return false; end if;

  select * into v_pub from public.published_rides
   where id = v_req.published_ride_id and driver_id = auth.uid() for update;
  if v_pub.id is null then raise exception 'not your published ride' using errcode = '42501'; end if;
  if v_req.status <> 'pending' then return false; end if;
  if v_pub.status <> 'active' then
    raise exception 'this published ride is no longer active' using errcode = '22023';
  end if;
  if v_pub.available_seats < v_req.seats_requested then return false; end if;

  v_seats := greatest(1, v_req.seats_requested)::smallint;

  -- A request need not carry its own endpoints; riders who searched from the
  -- route's own origin are travelling the published journey.
  v_from_lat := coalesce(v_req.pickup_lat, v_pub.from_lat);
  v_from_lng := coalesce(v_req.pickup_lng, v_pub.from_lng);
  v_to_lat   := coalesce(v_req.drop_lat,   v_pub.to_lat);
  v_to_lng   := coalesce(v_req.drop_lng,   v_pub.to_lng);

  select * into v_rider from public.users where id = v_req.rider_id;
  v_trip := public.carpool_trip(v_pub.id);

  -- ── is this rider actually on the way? ────────────────────────────────────
  -- Until now a driver could accept a request whose drop was in another
  -- district, discover it at departure, and have no way to undo it.
  select * into path from public.trip_remaining_path(v_trip.id);
  if coalesce(array_length(path.lats, 1), 0) >= 2 then
    path_km := public.path_length_km(path.lats, path.lngs);
    select * into p_loc from public.path_locate(path.lats, path.lngs, v_from_lat, v_from_lng);
    select * into d_loc from public.path_locate(path.lats, path.lngs, v_to_lat,   v_to_lng);
    p_prog := public.stop_progress(path.lats, path.lngs, v_from_lat, v_from_lng);
    d_prog := public.stop_progress(path.lats, path.lngs, v_to_lat,   v_to_lng);

    if p_loc.offset_km > cfg.carpool_corridor_km then
      raise exception 'that pickup is % km off your route', round(p_loc.offset_km::numeric, 1)
        using errcode = '22023';
    end if;
    if d_loc.offset_km > cfg.carpool_corridor_km
       and d_prog - path_km > cfg.carpool_max_extension_km then
      raise exception 'that drop is too far past where you are going' using errcode = '22023';
    end if;
    if d_prog <= p_prog then
      raise exception 'that drop is behind that pickup on your route' using errcode = '22023';
    end if;
  end if;

  -- ── the booking ───────────────────────────────────────────────────────────
  insert into public.rides (
    rider_id, driver_id, from_lat, from_lng, to_lat, to_lng,
    from_address, to_address, vehicle_type, seats, shareable, pooled,
    status, published_ride_id, fare_locked, fare, trip_id, scheduled_for
  ) values (
    v_req.rider_id, v_pub.driver_id, v_from_lat, v_from_lng, v_to_lat, v_to_lng,
    coalesce(v_req.notes, v_pub.from_address), v_pub.to_address,
    v_trip.vehicle_class, v_seats, true, true,
    'accepted', v_pub.id, true,
    round(coalesce(v_pub.fare_per_seat, 0) * v_seats, 2), v_trip.id,
    v_pub.departure_time
  ) returning * into v_ride;

  -- `rides_set_fare` forces `scheduled` on a future departure; a seat that is
  -- sold and assigned is accepted, whenever it leaves.
  update public.rides set status = 'accepted', accepted_at = now()
   where id = v_ride.id returning * into v_ride;

  perform public.trip_place_stops(v_trip.id, v_ride.id);
  perform public.trip_recount(v_trip.id);
  perform public.trip_assert_capacity(v_trip.id);

  -- ── the carpool bookkeeping the existing screens still read ───────────────
  update public.ride_requests
     set status = 'accepted', ride_id = v_ride.id
   where id = p_request_id;

  update public.published_rides
     set available_seats = available_seats - v_seats,
         accepted_riders = accepted_riders || jsonb_build_object(
           'user_id', v_req.rider_id, 'name', v_rider.name, 'mobile', v_rider.mobile,
           'seats', v_seats, 'ride_id', v_ride.id,
           'pickup', jsonb_build_object('lat', v_from_lat, 'lng', v_from_lng),
           'drop',   jsonb_build_object('lat', v_to_lat,   'lng', v_to_lng)),
         updated_at = now()
   where id = v_pub.id;

  insert into public.ride_events (ride_id, actor_id, status, note, meta)
  values (v_ride.id, auth.uid(), 'accepted', 'seat confirmed on a published ride',
          jsonb_build_object('trip_id', v_trip.id, 'published_ride_id', v_pub.id,
                             'seats', v_seats));

  insert into public.notifications (user_id, type, title, body, url)
  values (v_req.rider_id, 'carpool', 'Your seat is confirmed',
          'The driver accepted your request. Track the ride from Activity.',
          '/rider/ride/' || v_ride.id);
  return true;
end;
$$;
grant execute on function public.accept_ride_request(uuid) to authenticated;

-- ###########################################################################
-- 7. Undoing it has to undo the journey too
-- ###########################################################################

create or replace function public.remove_carpool_rider(p_published_ride_id uuid, p_rider_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_pub public.published_rides; v_entry jsonb; v_seats int := 0; v_ride_id uuid;
begin
  select * into v_pub from public.published_rides
   where id = p_published_ride_id and driver_id = auth.uid() for update;
  if v_pub.id is null then return false; end if;

  select e into v_entry from jsonb_array_elements(v_pub.accepted_riders) e
   where (e->>'user_id')::uuid = p_rider_id limit 1;
  if v_entry is null then return false; end if;
  v_seats := coalesce((v_entry->>'seats')::int, 0);

  select rq.ride_id into v_ride_id from public.ride_requests rq
   where rq.published_ride_id = p_published_ride_id and rq.rider_id = p_rider_id
     and rq.status = 'accepted'
   order by rq.created_at desc limit 1;

  -- Someone already aboard is not "removed" from a list; they are in the car.
  if exists (select 1 from public.rides r where r.id = v_ride_id and r.status = 'ongoing') then
    raise exception 'that rider is already on board' using errcode = '55006';
  end if;

  if v_ride_id is not null then
    update public.rides
       set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancellation_reason = 'removed from the shared ride by the driver'
     where id = v_ride_id and status in ('accepted','arrived','scheduled','pending');
    delete from public.trip_stops where ride_id = v_ride_id;
    if v_pub.trip_id is not null then
      perform public.trip_recount(v_pub.trip_id);
    end if;
  end if;

  update public.published_rides
     set accepted_riders = (
           select coalesce(jsonb_agg(e), '[]'::jsonb)
             from jsonb_array_elements(accepted_riders) e
            where (e->>'user_id')::uuid <> p_rider_id),
         available_seats = available_seats + v_seats,
         updated_at = now()
   where id = p_published_ride_id;

  update public.ride_requests set status = 'removed'
   where published_ride_id = p_published_ride_id and rider_id = p_rider_id;

  insert into public.notifications (user_id, type, title, body, url)
  values (p_rider_id, 'carpool', 'Removed from carpool',
          'The driver removed you from this shared ride.', '/activity');
  return true;
end;
$$;
grant execute on function public.remove_carpool_rider(uuid, uuid) to authenticated;

/**
 * A rider giving up their own seat. The driver-side path is
 * `remove_carpool_rider`; this is the other half, which never existed —
 * a rider could request a seat and had no way to release it.
 */
create or replace function public.cancel_carpool_seat(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_req public.ride_requests; v_pub public.published_rides; v_seats int;
begin
  select * into v_req from public.ride_requests
   where id = p_request_id and rider_id = auth.uid() for update;
  if v_req.id is null then return false; end if;
  if v_req.status not in ('pending','accepted') then return false; end if;

  select * into v_pub from public.published_rides
   where id = v_req.published_ride_id for update;

  if exists (select 1 from public.rides r where r.id = v_req.ride_id and r.status = 'ongoing') then
    raise exception 'you are already on this ride' using errcode = '55006';
  end if;

  v_seats := greatest(1, v_req.seats_requested);

  if v_req.ride_id is not null then
    update public.rides
       set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancellation_reason = 'rider released the seat'
     where id = v_req.ride_id and status in ('accepted','arrived','scheduled','pending');
    delete from public.trip_stops where ride_id = v_req.ride_id;
    if v_pub.trip_id is not null then perform public.trip_recount(v_pub.trip_id); end if;
  end if;

  if v_req.status = 'accepted' then
    update public.published_rides
       set accepted_riders = (
             select coalesce(jsonb_agg(e), '[]'::jsonb)
               from jsonb_array_elements(accepted_riders) e
              where (e->>'user_id')::uuid <> v_req.rider_id),
           available_seats = available_seats + v_seats,
           updated_at = now()
     where id = v_pub.id;
  end if;

  update public.ride_requests set status = 'removed' where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, url)
  values (v_pub.driver_id, 'carpool', 'A rider released their seat',
          'A seat on your published ride is free again.', '/activity');
  return true;
end;
$$;
grant execute on function public.cancel_carpool_seat(uuid) to authenticated;

-- ###########################################################################
-- 8. Departing
-- ###########################################################################

/**
 * The driver setting off. Marks the trip started and puts every confirmed seat
 * into `arrived`, which is what the driver screen lists so each rider can be
 * boarded against their own code. Boarding itself stays `start_ride` — the
 * per-rider OTP is the whole point, and a carpool has several.
 */
create or replace function public.start_carpool_trip(p_published_ride_id uuid)
returns public.trips language plpgsql security definer set search_path = public as $$
declare v_pub public.published_rides; v_trip public.trips;
begin
  select * into v_pub from public.published_rides
   where id = p_published_ride_id and driver_id = auth.uid() for update;
  if v_pub.id is null then raise exception 'not your published ride' using errcode = '42501'; end if;

  perform public.assert_can_drive(auth.uid());

  if exists (select 1 from public.trips t
              where t.driver_id = auth.uid() and t.status = 'active'
                and t.published_ride_id is distinct from p_published_ride_id) then
    raise exception 'finish the trip you are on before starting this one'
      using errcode = '55006';
  end if;

  v_trip := public.carpool_trip(p_published_ride_id);

  if not exists (select 1 from public.rides r
                  where r.trip_id = v_trip.id and r.status in ('accepted','arrived')) then
    raise exception 'nobody has a seat on this ride yet' using errcode = '22023';
  end if;

  update public.trips set status = 'active', started_at = coalesce(started_at, now())
   where id = v_trip.id returning * into v_trip;

  update public.rides set status = 'arrived'
   where trip_id = v_trip.id and status = 'accepted';

  update public.active_drivers
     set on_ride = true, heartbeat_at = now()
   where user_id = auth.uid();

  return v_trip;
end;
$$;
grant execute on function public.start_carpool_trip(uuid) to authenticated;

-- ###########################################################################
-- 9. What each side may read
-- ###########################################################################

-- A rider who holds a seat may see the trip and the driver, exactly as a pooled
-- rider does. `my_trip` from 0012 already answers "is this my trip?" from the
-- rides table, and a carpool booking is a rides row, so both policies cover
-- this without change. The one gap is `published_rides`: a rider needs to keep
-- reading the route they bought into.
-- 0001 shipped `using (true)` here, which is how the whole table — including
-- every rider's name and mobile number inside `accepted_riders` — was readable
-- by any signed-in user. Policies are OR'd, so the narrower rule below only
-- means anything once that one is gone.
--
-- Direct reads are now need-to-know: your own publications, ones you hold a
-- seat on, and admin. Browsing the marketplace goes through
-- `search_published_rides`, which is sanitised in section 13.
drop policy if exists "pub_select_auth" on public.published_rides;
drop policy if exists "published_read_own_seat" on public.published_rides;
create policy "published_read_own_seat" on public.published_rides for select to authenticated
  using (
    driver_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.rides r
                where r.published_ride_id = published_rides.id and r.rider_id = auth.uid())
  );

-- ###########################################################################
-- 10. Backfill
--
-- Seats sold before this migration were only ever a JSON entry. They are left
-- alone: inventing rides rows for journeys that may already have happened would
-- put phantom fares on people's accounts and phantom earnings on drivers'.
-- Rides published but not yet departed simply get their trip on first accept.
-- ###########################################################################

-- ###########################################################################
-- 11. A headcount cannot exceed the seats that were bought
--
-- `start_ride` takes the driver's count of who actually got in and lets it
-- stand up to the vehicle's capacity. For a hail that is the entire feature —
-- the fare follows the headcount. For a sold seat it is wrong twice over: the
-- price was agreed, so a larger count bills nothing extra, and the seats were
-- inventory, so a larger count silently overruns the vehicle. Boarding four
-- people onto two paid-for seats in a car already carrying one raised
-- `trips_seats_sane` and left the driver looking at a database error while a
-- passenger stood at the door.
--
-- Patched onto whatever `start_ride` currently is, rather than restated, so the
-- displacement and repricing logic below it stays in one place.
-- ###########################################################################

do $$
declare src text; patched text;
  needle text := '  v_head := greatest(coalesce(p_headcount, v_ride.seats), 1);';
  fix text := '  v_head := greatest(coalesce(p_headcount, v_ride.seats), 1);
  -- You cannot board more people than you paid for.
  if v_ride.fare_locked then v_head := least(v_head, v_ride.seats); end if;';
begin
  src := pg_get_functiondef('public.start_ride(uuid, text, smallint)'::regprocedure);
  if position(needle in src) = 0 then
    raise exception 'start_ride no longer has the headcount line this patch expects';
  end if;
  patched := replace(src, needle, fix);
  execute patched;
end $$;

-- ###########################################################################
-- 12. Completion must charge what was agreed
--
-- `complete_ride` rebuilds the fare from scratch — base, distance, surge, extra
-- seats, waiting, pool discount, breach credit — and writes the result to both
-- the ride and the payment. For a hail that is correct; the fare was always
-- provisional. For a sold seat it silently replaced a published ₹90 with ₹205
-- at the moment the rider got out, which is the worst possible time to find out
-- the price changed.
--
-- When the fare is locked the total is simply the agreed one. The receipt shows
-- it as the whole of the charge rather than inventing a breakdown, because
-- there wasn't one: the driver named a seat price.
-- ###########################################################################

do $$
declare src text; patched text;
  needle text := '  v_total    := greatest(0, ceil(v_base + v_dist + v_surge + v_seat + v_wait - v_disc - v_credit));';
  fix text := '  if v_ride.fare_locked then
    -- A published seat price is the price. There is no breakdown to show.
    v_base := coalesce(v_ride.fare, 0);
    v_dist := 0; v_surge := 0; v_seat := 0; v_wait := 0; v_disc := 0; v_credit := 0;
    v_total := v_base;
  else
    v_total := greatest(0, ceil(v_base + v_dist + v_surge + v_seat + v_wait - v_disc - v_credit));
  end if;';
begin
  src := pg_get_functiondef('public.complete_ride(uuid, integer)'::regprocedure);
  if position(needle in src) = 0 then
    raise exception 'complete_ride no longer has the total line this patch expects';
  end if;
  patched := replace(src, needle, fix);
  execute patched;
end $$;

-- ###########################################################################
-- 13. Who else is in the car is not a browsing feature
--
-- `search_published_rides` returned `accepted_riders` verbatim to anyone
-- searching, and that column holds each accepted rider's name, mobile number
-- and the exact coordinates of their pickup and drop. The Find-a-match screen
-- plotted those pins on a preview map. Anyone with an account could search a
-- corridor and collect home addresses and phone numbers of people who had done
-- nothing but book a seat.
--
-- What the preview legitimately needs is the *shape* of the detour, which is
-- the driver's own leg, plus some sense of how full the car is. Both survive;
-- the identities do not.
-- ###########################################################################

drop function if exists public.search_published_rides(
  double precision, double precision, integer, numeric, double precision, timestamptz
);
create or replace function public.search_published_rides(
  p_lat double precision,
  p_lng double precision,
  p_seats integer default 1,
  p_max_price numeric default null,
  p_max_detour_km double precision default null,
  p_after timestamptz default null
) returns table (
  id uuid, driver_id uuid, driver_name text, driver_rating numeric,
  vehicle_class text, vehicle_type text,
  from_lat double precision, from_lng double precision,
  to_lat double precision, to_lng double precision,
  from_address text, to_address text,
  available_seats integer, distance_km numeric, fare_per_seat numeric,
  notes text, departure_time timestamptz,
  riders_aboard integer, seats_taken integer,
  detour_km double precision, my_request_status text
) language sql stable security definer set search_path = public as $$
  select pr.id, pr.driver_id, u.name, u.user_rating,
         d.vehicle_class, d.vehicle_type,
         pr.from_lat, pr.from_lng, pr.to_lat, pr.to_lng,
         pr.from_address, pr.to_address,
         pr.available_seats, pr.distance_km, pr.fare_per_seat,
         pr.notes, pr.departure_time,
         coalesce(jsonb_array_length(pr.accepted_riders), 0),
         coalesce((select sum(coalesce((e->>'seats')::int, 0))::int
                     from jsonb_array_elements(pr.accepted_riders) e), 0),
         public.haversine_km(p_lat, p_lng, pr.from_lat, pr.from_lng),
         (select rq.status from public.ride_requests rq
           where rq.published_ride_id = pr.id and rq.rider_id = auth.uid()
           order by rq.created_at desc limit 1)
    from public.published_rides pr
    join public.users u   on u.id = pr.driver_id
    join public.drivers d on d.user_id = pr.driver_id
   where auth.uid() is not null
     and pr.status = 'active'
     and pr.driver_id <> auth.uid()
     and pr.available_seats >= greatest(1, coalesce(p_seats, 1))
     and (p_after is null or pr.departure_time >= p_after)
     and (p_max_price is null or p_max_price <= 0 or pr.fare_per_seat <= p_max_price)
     and (p_max_detour_km is null or p_max_detour_km <= 0
          or public.haversine_km(p_lat, p_lng, pr.from_lat, pr.from_lng) <= p_max_detour_km)
   order by public.haversine_km(p_lat, p_lng, pr.from_lat, pr.from_lng) asc, pr.departure_time asc
   limit 50;
$$;
grant execute on function public.search_published_rides(
  double precision, double precision, integer, numeric, double precision, timestamptz
) to authenticated;

-- ###########################################################################
-- 14. Rejecting is for requests nobody has accepted yet
--
-- `reject_ride_request` never checked the request's current state. Called on an
-- already-accepted one it flipped the status to `rejected` and stopped: the
-- seat stayed off sale, the rider kept their place in `accepted_riders`, and —
-- now that acceptance creates one — the booking stayed live on the trip. The
-- rider would have been told they were declined and then found a driver
-- arriving for them. Withdrawing an accepted seat is `remove_carpool_rider`,
-- which unwinds all three.
-- ###########################################################################

create or replace function public.reject_ride_request(p_request_id uuid, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_req public.ride_requests;
begin
  select r.* into v_req from public.ride_requests r
    join public.published_rides pr on pr.id = r.published_ride_id
   where r.id = p_request_id and pr.driver_id = auth.uid();
  if v_req.id is null then return false; end if;

  if v_req.status = 'accepted' then
    raise exception 'that seat is already confirmed — remove the rider instead'
      using errcode = '22023';
  end if;
  if v_req.status <> 'pending' then return false; end if;

  update public.ride_requests set status = 'rejected' where id = p_request_id;
  insert into public.notifications (user_id, type, title, body, url)
  values (v_req.rider_id, 'carpool', 'Carpool request declined',
          coalesce(p_reason, 'The driver could not take this request.'), '/activity');
  return true;
end;
$$;
grant execute on function public.reject_ride_request(uuid, text) to authenticated;
