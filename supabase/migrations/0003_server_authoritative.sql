-- ============================================================================
-- Gol·Gol — server-authoritative fare, distance, start-OTP & matching (Phase 5)
-- Moves trust-sensitive logic out of the browser:
--   • distance + fare are recomputed on the server (client values ignored)
--   • the ride start-OTP lives in a rider-only table; the driver verifies it via
--     an RPC and never gets to read it
--   • nearby-ride matching is a server-side query
-- ============================================================================

-- ---------------------------------------------------------- helpers/pricing ---
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Pricing table mirrors frontend/src/lib/vehicles.js (keep in sync).
create table if not exists public.fare_config (
  vehicle_type text primary key,
  base_fare    numeric not null,
  per_km       numeric not null
);
insert into public.fare_config (vehicle_type, base_fare, per_km) values
  ('auto', 25, 12), ('mini', 40, 15), ('bike', 15, 8),
  ('sedan', 60, 18), ('suv', 80, 22)
on conflict (vehicle_type) do update
  set base_fare = excluded.base_fare, per_km = excluded.per_km;

-- ------------------------------------------------ authoritative fare on insert ---
create or replace function public.rides_set_fare()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg record;
begin
  new.distance_km := round(public.haversine_km(new.from_lat, new.from_lng, new.to_lat, new.to_lng)::numeric, 2);
  select * into cfg from public.fare_config where vehicle_type = new.vehicle_type;
  if found then
    new.fare := ceil(cfg.base_fare + new.distance_km * cfg.per_km);
  end if;
  new.start_otp := null; -- the OTP now lives only in public.ride_otps
  return new;
end;
$$;
drop trigger if exists trg_rides_set_fare on public.rides;
create trigger trg_rides_set_fare before insert on public.rides
  for each row execute function public.rides_set_fare();

-- ------------------------------------------------------- rider-only start OTP ---
create table if not exists public.ride_otps (
  ride_id    uuid primary key references public.rides (id) on delete cascade,
  otp        text not null,
  created_at timestamptz not null default now()
);
alter table public.ride_otps enable row level security;
grant select on public.ride_otps to authenticated;

-- Only the ride's rider may read the code (no insert/update/delete for anyone —
-- the trigger below writes it with definer rights).
drop policy if exists "otp_select_rider" on public.ride_otps;
create policy "otp_select_rider" on public.ride_otps for select to authenticated
  using (exists (select 1 from public.rides r where r.id = ride_id and r.rider_id = auth.uid()));

create or replace function public.rides_make_otp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ride_otps (ride_id, otp)
  values (new.id, lpad(floor(random() * 10000)::int::text, 4, '0'))
  on conflict (ride_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_rides_make_otp on public.rides;
create trigger trg_rides_make_otp after insert on public.rides
  for each row execute function public.rides_make_otp();

-- Driver starts the ride by proving the OTP, without ever reading it.
create or replace function public.start_ride(p_ride_id uuid, p_otp text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select exists (
    select 1 from public.rides r
    join public.ride_otps o on o.ride_id = r.id
    where r.id = p_ride_id
      and r.driver_id = auth.uid()
      and r.status = 'accepted'
      and o.otp = p_otp
  ) into ok;
  if ok then
    update public.rides set status = 'ongoing' where id = p_ride_id;
  end if;
  return ok;
end;
$$;
grant execute on function public.start_ride(uuid, text) to authenticated;

-- ------------------------------------------------------ server-side matching ---
-- Runs as the caller (RLS applies); returns only nearby pending rides so drivers
-- never pull the full pending table down to the client.
create or replace function public.nearby_pending_rides(
  p_lat double precision, p_lng double precision,
  p_vehicle text, p_radius_km double precision default 5
) returns setof public.rides language sql stable set search_path = public as $$
  select r.* from public.rides r
  where r.status = 'pending'
    and r.vehicle_type = p_vehicle
    and public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) <= p_radius_km
  order by public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) asc;
$$;
grant execute on function public.nearby_pending_rides(double precision, double precision, text, double precision) to authenticated;
