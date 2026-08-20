-- ============================================================================
-- Gol·Gol — break the RLS recursion between `rides` and `drivers`
--
-- `rides_select_dispatch` (0005) reads `public.drivers` to ask whether the
-- caller is an eligible on-duty driver. `drivers_select_scoped` (0006) reads
-- `public.rides` to ask whether the caller shares a ride with that driver.
--
--   rides → drivers → rides → …
--
-- Postgres refuses: "infinite recursion detected in policy for relation rides".
-- Every authenticated SELECT on `rides` fails. Not some — every one. The app
-- cannot load a ride, a trip, a stop, a payment or a seat hold, because all of
-- their policies read `rides` too.
--
-- It has been latent since 0006 and nothing caught it, because the test suite
-- ran as `postgres`, which bypasses RLS. A policy is not "reviewed" until
-- something has actually executed it.
--
-- The fix is to stop policies reading RLS-protected tables directly. Both sides
-- now go through SECURITY DEFINER helpers, which run with the definer's rights
-- and so do not re-enter policy evaluation. That is also the standard shape for
-- this on Supabase.
-- ============================================================================

-- ###########################################################################
-- 1. THE TWO QUESTIONS, ASKED WITHOUT RE-ENTERING RLS
-- ###########################################################################

/**
 * Is the caller an approved, on-duty, unoccupied driver of the right class,
 * within dispatch range of this pickup?
 *
 * Exactly the predicate `rides_select_dispatch` used to inline — the difference
 * is that reading `active_drivers` and `drivers` here does not trigger their
 * policies, so nothing loops back to `rides`.
 */
create or replace function public.can_dispatch_to_me(
  p_vehicle text, p_lat double precision, p_lng double precision, p_radius_km double precision default 8
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.active_drivers ad
      join public.drivers d on d.user_id = ad.user_id
     where ad.user_id = auth.uid()
       and ad.is_online
       and not ad.on_ride
       and d.verification_status = 'approved'
       and d.vehicle_class = p_vehicle
       and ad.current_lat is not null
       and public.haversine_km(ad.current_lat, ad.current_lng, p_lat, p_lng) <= p_radius_km
  );
$$;
grant execute on function public.can_dispatch_to_me(text, double precision, double precision, double precision)
  to authenticated;

/** Does the caller share a ride with this user, in either direction? */
create or replace function public.shares_ride_with(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rides r
     where (r.driver_id = p_other and r.rider_id = auth.uid())
        or (r.rider_id  = p_other and r.driver_id = auth.uid())
  );
$$;
grant execute on function public.shares_ride_with(uuid) to authenticated;

/** Has the caller been accepted onto a carpool this driver published? */
create or replace function public.accepted_on_carpool_of(p_driver uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.published_rides pr
      join public.ride_requests rq on rq.published_ride_id = pr.id
     where pr.driver_id = p_driver
       and rq.rider_id = auth.uid()
       and rq.status = 'accepted'
  );
$$;
grant execute on function public.accepted_on_carpool_of(uuid) to authenticated;

-- ###########################################################################
-- 2. THE SAME RULES, WITHOUT THE CYCLE
-- ###########################################################################

drop policy if exists "rides_select_dispatch" on public.rides;
create policy "rides_select_dispatch" on public.rides for select to authenticated
  using (
    status = 'pending'
    and public.can_dispatch_to_me(vehicle_type, from_lat, from_lng)
  );

drop policy if exists "drivers_select_scoped" on public.drivers;
create policy "drivers_select_scoped" on public.drivers for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.shares_ride_with(drivers.user_id)
    or public.accepted_on_carpool_of(drivers.user_id)
  );

-- ###########################################################################
-- 3. THE SAME TRAP, ELSEWHERE
--
-- `active_drivers` is the other table a rider reads about their driver, and its
-- policy has the same shape. Route it through the same helper so a future edit
-- to `rides` cannot reintroduce the loop from that direction.
-- ###########################################################################

drop policy if exists "active_select_scoped" on public.active_drivers;
create policy "active_select_scoped" on public.active_drivers for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.shares_ride_with(active_drivers.user_id)
  );

-- ###########################################################################
-- 4. AND THE TABLES WHOSE POLICIES READ `rides`
--
-- trips, trip_stops, occupancy_events, seat_holds and match_queue all ask
-- "is this ride mine?" of an RLS-protected `rides`. That is one hop from being
-- another cycle the moment anything in `rides`' own policy grows. One helper,
-- used everywhere, keeps the answer out of policy evaluation entirely.
-- ###########################################################################

/** Is this ride one the caller is on, either side of it? */
create or replace function public.my_ride(p_ride_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rides r
     where r.id = p_ride_id and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
  );
$$;
grant execute on function public.my_ride(uuid) to authenticated;

/** Is this trip one the caller drives or rides on? */
create or replace function public.my_trip(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips t where t.id = p_trip_id and t.driver_id = auth.uid())
      or exists (select 1 from public.rides r where r.trip_id = p_trip_id and r.rider_id = auth.uid());
$$;
grant execute on function public.my_trip(uuid) to authenticated;

drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select to authenticated
using (driver_id = auth.uid() or public.my_trip(trips.id) or public.is_admin());

-- A rider still sees only their own stops: the full sequence would hand them a
-- stranger's pickup address.
drop policy if exists trip_stops_read on public.trip_stops;
create policy trip_stops_read on public.trip_stops for select to authenticated
using (
  exists (select 1 from public.trips t where t.id = trip_stops.trip_id and t.driver_id = auth.uid())
  or public.my_ride(trip_stops.ride_id)
  or public.is_admin()
);

drop policy if exists occupancy_read on public.occupancy_events;
create policy occupancy_read on public.occupancy_events for select to authenticated
using (public.my_ride(occupancy_events.ride_id) or public.is_admin());

drop policy if exists seat_holds_read on public.seat_holds;
create policy seat_holds_read on public.seat_holds for select to authenticated
using (driver_id = auth.uid() or public.my_ride(seat_holds.ride_id) or public.is_admin());

drop policy if exists match_queue_read on public.match_queue;
create policy match_queue_read on public.match_queue for select to authenticated
using (public.my_ride(match_queue.ride_id) or public.is_admin());
