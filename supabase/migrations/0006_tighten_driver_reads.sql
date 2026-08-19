-- ============================================================================
-- Gol·Gol — close the remaining driver-data leak, and two dispatch guards
--
-- 1. `drivers_select_auth` was `using (true)`, so any signed-in user could read
--    every driver's row — licence number, licence expiry and the document URL
--    included. Carpool search is the only feature that needed driver details
--    from strangers, so that moves to a definer RPC returning safe columns and
--    the table itself becomes need-to-know.
-- 2. A driver already on a job could still see and claim a second request.
-- ============================================================================

-- ###########################################################################
-- 1. Carpool search as an RPC (safe columns only, filtering done server-side)
-- ###########################################################################

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
  notes text, departure_time timestamptz, accepted_riders jsonb,
  detour_km double precision, my_request_status text
) language sql stable security definer set search_path = public as $$
  select pr.id, pr.driver_id, u.name, u.user_rating,
         d.vehicle_class, d.vehicle_type,
         pr.from_lat, pr.from_lng, pr.to_lat, pr.to_lng,
         pr.from_address, pr.to_address,
         pr.available_seats, pr.distance_km, pr.fare_per_seat,
         pr.notes, pr.departure_time, pr.accepted_riders,
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
   order by 21 asc, pr.departure_time asc
   limit 50;
$$;
grant execute on function public.search_published_rides(
  double precision, double precision, integer, numeric, double precision, timestamptz
) to authenticated;

-- ###########################################################################
-- 2. `drivers` becomes need-to-know
-- ###########################################################################

drop policy if exists "drivers_select_auth" on public.drivers;
drop policy if exists "drivers_select_scoped" on public.drivers;
create policy "drivers_select_scoped" on public.drivers for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    -- the driver on a ride we're the rider of (and vice versa), so each side
    -- can show the other's vehicle
    or exists (
      select 1 from public.rides r
       where (r.driver_id = drivers.user_id and r.rider_id = auth.uid())
          or (r.rider_id  = drivers.user_id and r.driver_id = auth.uid())
    )
    -- a carpool driver who already accepted us onto their ride
    or exists (
      select 1 from public.published_rides pr
       join public.ride_requests rq on rq.published_ride_id = pr.id
      where pr.driver_id = drivers.user_id
        and rq.rider_id = auth.uid()
        and rq.status = 'accepted'
    )
  );

-- ###########################################################################
-- 3. One job at a time
-- ###########################################################################

create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public as $$
declare v_ride public.rides;
begin
  if not exists (
    select 1 from public.drivers d
     where d.user_id = auth.uid() and d.verification_status = 'approved'
  ) then
    raise exception 'not an approved driver' using errcode = '42501';
  end if;

  -- Guard against claiming a second ride while one is in progress.
  if exists (
    select 1 from public.active_drivers ad
     where ad.user_id = auth.uid() and ad.on_ride and ad.current_ride_id is distinct from p_ride_id
  ) then
    raise exception 'finish your current ride before accepting another'
      using errcode = '22023';
  end if;

  update public.rides
     set status = 'accepted', driver_id = auth.uid(), accepted_at = now()
   where id = p_ride_id and status = 'pending' and driver_id is null
  returning * into v_ride;

  if v_ride.id is null then return null; end if;

  update public.active_drivers
     set on_ride = true, current_ride_id = p_ride_id, heartbeat_at = now()
   where user_id = auth.uid();

  return v_ride;
end;
$$;
grant execute on function public.accept_ride(uuid) to authenticated;

-- Don't offer work to a driver who is mid-job, or who has gone stale.
create or replace function public.nearby_pending_rides(
  p_lat double precision,
  p_lng double precision,
  p_vehicle text default null,
  p_radius_km double precision default 5
) returns table (
  id uuid, rider_id uuid, from_lat double precision, from_lng double precision,
  to_lat double precision, to_lng double precision, from_address text, to_address text,
  vehicle_type text, distance_km numeric, fare numeric, status text,
  payment_method text, pickup_notes text, scheduled_for timestamptz, created_at timestamptz,
  pickup_distance_km double precision, rider_name text, rider_rating numeric
) language plpgsql stable security definer set search_path = public as $$
declare v_class text;
begin
  select d.vehicle_class into v_class
    from public.drivers d
    join public.active_drivers ad on ad.user_id = d.user_id
   where d.user_id = auth.uid()
     and d.verification_status = 'approved'
     and not ad.on_ride;
  if v_class is null then return; end if;
  if p_vehicle is not null and p_vehicle in ('bike','auto','mini','sedan','suv') then
    v_class := p_vehicle;
  end if;

  return query
  select r.id, r.rider_id, r.from_lat, r.from_lng, r.to_lat, r.to_lng,
         r.from_address, r.to_address, r.vehicle_type, r.distance_km, r.fare, r.status,
         r.payment_method, r.pickup_notes, r.scheduled_for, r.created_at,
         public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) as pickup_distance_km,
         u.name, u.user_rating
    from public.rides r
    join public.users u on u.id = r.rider_id
   where r.status = 'pending'
     and r.vehicle_type = v_class
     and r.rider_id <> auth.uid()
     and r.created_at > now() - interval '15 minutes'
     and public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) <= p_radius_km
   order by public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) asc;
end;
$$;
grant execute on function public.nearby_pending_rides(double precision, double precision, text, double precision) to authenticated;

-- ###########################################################################
-- 4. Saved places: make `home`/`work` upsertable
--
-- 0005 enforced one home and one work per user with a *partial* unique index,
-- which Postgres can't use for ON CONFLICT inference — so an upsert failed
-- outright. A generated column gives a total unique index with the same
-- semantics: home/work collapse to one row each, `custom` rows stay unlimited.
-- ###########################################################################

drop index if exists public.idx_saved_places_unique_kind;

alter table public.saved_places
  add column if not exists slot text
  generated always as (case when kind in ('home','work') then kind else id::text end) stored;

create unique index if not exists idx_saved_places_slot
  on public.saved_places (user_id, slot);
