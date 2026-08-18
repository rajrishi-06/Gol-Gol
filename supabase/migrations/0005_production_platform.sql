-- ============================================================================
-- Gol·Gol — production platform (Phase 6)
--
-- This migration turns the MVP schema into something that can actually run a
-- two-sided marketplace:
--
--   1. Unifies the vehicle taxonomy so dispatch works for every ride class.
--   2. Closes the RLS holes (anonymous user enumeration, "any user can edit any
--      pending ride", global live-driver GPS reads, unscoped realtime).
--   3. Adds the missing product surface: ratings, payments & receipts,
--      cancellations with reasons + fees, scheduled rides, saved places,
--      emergency contacts, shareable live trips, per-user settings, an audit
--      trail of ride events, and admin driver verification.
--   4. Makes state transitions server-authoritative RPCs instead of raw client
--      UPDATEs, so they are atomic, ordered and auditable.
--   5. Adds driver heartbeats so "online" means online.
--
-- Safe to run against an existing project: everything is idempotent.
-- ============================================================================

-- ###########################################################################
-- 1. VEHICLE TAXONOMY
--
-- `drivers.vehicle_type` was the physical body type (car/bike/auto/van/truck)
-- while `rides.vehicle_type` is the service class (auto/mini/bike/sedan/suv).
-- Dispatch compared the two directly, so a `car` driver could never be matched
-- to a `mini`, `sedan` or `suv` request — three of five classes were dead.
--
-- `vehicle_class` is now the matching key; `vehicle_type` stays as the body type
-- for display and document checks.
-- ###########################################################################

alter table public.drivers add column if not exists vehicle_class    text;
alter table public.drivers add column if not exists vehicle_make     text;
alter table public.drivers add column if not exists vehicle_model    text;
alter table public.drivers add column if not exists vehicle_color    text;
alter table public.drivers add column if not exists rejection_reason text;
alter table public.drivers add column if not exists verified_at      timestamptz;
alter table public.drivers add column if not exists verified_by      uuid references public.users (id) on delete set null;

-- Backfill: body type → smallest sensible service class.
update public.drivers
   set vehicle_class = case vehicle_type
                         when 'bike'  then 'bike'
                         when 'auto'  then 'auto'
                         when 'car'   then 'mini'
                         when 'van'   then 'suv'
                         when 'truck' then 'suv'
                         else 'mini'
                       end
 where vehicle_class is null;

alter table public.drivers drop constraint if exists drivers_vehicle_class_check;
alter table public.drivers add constraint drivers_vehicle_class_check
  check (vehicle_class is null or vehicle_class in ('bike','auto','mini','sedan','suv'));

create index if not exists idx_drivers_class on public.drivers (vehicle_class);

-- ###########################################################################
-- 2. USERS — admin flag + settings
-- ###########################################################################

alter table public.users add column if not exists is_admin      boolean not null default false;
alter table public.users add column if not exists avatar_url    text;
alter table public.users add column if not exists rating_count  integer not null default 0;
alter table public.users add column if not exists total_rides   integer not null default 0;

-- Admin check used by policies, guards and admin RPCs throughout this file.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.users where id = auth.uid()), false);
$$;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.user_settings (
  user_id            uuid primary key references public.users (id) on delete cascade,
  notify_ride        boolean not null default true,
  notify_chat        boolean not null default true,
  notify_promos      boolean not null default false,
  voice_guidance     boolean not null default true,
  share_trip_default boolean not null default false,
  language           text    not null default 'en',
  updated_at         timestamptz not null default now()
);

-- ###########################################################################
-- 3. RIDES — lifecycle timestamps, money, cancellation, scheduling
-- ###########################################################################

alter table public.rides add column if not exists scheduled_for       timestamptz;
alter table public.rides add column if not exists accepted_at         timestamptz;
alter table public.rides add column if not exists arrived_at          timestamptz;
alter table public.rides add column if not exists started_at          timestamptz;
alter table public.rides add column if not exists completed_at        timestamptz;
alter table public.rides add column if not exists cancelled_at        timestamptz;
alter table public.rides add column if not exists cancelled_by        uuid references public.users (id) on delete set null;
alter table public.rides add column if not exists cancellation_reason text;
alter table public.rides add column if not exists cancellation_fee    numeric not null default 0;
alter table public.rides add column if not exists payment_method      text not null default 'cash';
alter table public.rides add column if not exists payment_status      text not null default 'pending';
alter table public.rides add column if not exists eta_minutes         integer;
alter table public.rides add column if not exists eta_distance_km     numeric;
alter table public.rides add column if not exists eta_updated_at      timestamptz;
alter table public.rides add column if not exists pickup_notes        text;
alter table public.rides add column if not exists surge_multiplier    numeric not null default 1;
alter table public.rides add column if not exists tip_amount          numeric not null default 0;
alter table public.rides add column if not exists final_fare          numeric;

alter table public.rides drop constraint if exists rides_payment_method_check;
alter table public.rides add constraint rides_payment_method_check
  check (payment_method in ('cash','upi','card','wallet'));

alter table public.rides drop constraint if exists rides_payment_status_check;
alter table public.rides add constraint rides_payment_status_check
  check (payment_status in ('pending','paid','failed','refunded','waived'));

-- Extended status machine: pending → accepted → arrived → ongoing → completed,
-- with `cancelled` and `expired` as terminal states. `scheduled` holds a future
-- booking until its dispatch window opens.
alter table public.rides drop constraint if exists rides_status_check;
alter table public.rides add constraint rides_status_check
  check (status in ('scheduled','pending','accepted','arrived','ongoing','completed','cancelled','expired'));

create index if not exists idx_rides_created      on public.rides (created_at desc);
create index if not exists idx_rides_rider_status on public.rides (rider_id, status);
create index if not exists idx_rides_driver_status on public.rides (driver_id, status);
create index if not exists idx_rides_scheduled    on public.rides (scheduled_for) where status = 'scheduled';

-- ###########################################################################
-- 4. ACTIVE DRIVERS — heartbeat + telemetry
-- ###########################################################################

alter table public.active_drivers add column if not exists heartbeat_at timestamptz;
alter table public.active_drivers add column if not exists heading      double precision;
alter table public.active_drivers add column if not exists speed_kmh    double precision;
alter table public.active_drivers add column if not exists accuracy_m   double precision;

update public.active_drivers
   set heartbeat_at = coalesce(heartbeat_at, last_active_at, last_updated, now())
 where heartbeat_at is null;

create index if not exists idx_active_drivers_heartbeat on public.active_drivers (heartbeat_at desc);

-- How long a driver stays "live" without a heartbeat.
create or replace function public.driver_stale_after()
returns interval language sql immutable as $$ select interval '90 seconds' $$;

-- ###########################################################################
-- 5. NEW TABLES
-- ###########################################################################

-- ── ride_events: the append-only status timeline ────────────────────────────
create table if not exists public.ride_events (
  id         bigserial primary key,
  ride_id    uuid not null references public.rides (id) on delete cascade,
  status     text not null,
  actor_id   uuid references public.users (id) on delete set null,
  note       text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ride_events_ride on public.ride_events (ride_id, created_at);

-- ── ratings: two-way, one per rater per ride ────────────────────────────────
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides (id) on delete cascade,
  rater_id   uuid not null references public.users (id) on delete cascade,
  ratee_id   uuid not null references public.users (id) on delete cascade,
  stars      integer not null check (stars between 1 and 5),
  comment    text,
  tags       text[] not null default '{}',
  tip_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (ride_id, rater_id)
);
create index if not exists idx_ratings_ratee on public.ratings (ratee_id);

-- ── payments: one row per settled ride ──────────────────────────────────────
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  ride_id       uuid not null references public.rides (id) on delete cascade,
  payer_id      uuid not null references public.users (id) on delete cascade,
  payee_id      uuid references public.users (id) on delete set null,
  method        text not null default 'cash' check (method in ('cash','upi','card','wallet')),
  status        text not null default 'pending' check (status in ('pending','paid','failed','refunded','waived')),
  base_fare     numeric not null default 0,
  distance_fare numeric not null default 0,
  surge_amount  numeric not null default 0,
  waiting_fee   numeric not null default 0,
  cancellation_fee numeric not null default 0,
  tip_amount    numeric not null default 0,
  platform_fee  numeric not null default 0,
  driver_payout numeric not null default 0,
  amount        numeric not null default 0,
  reference     text,
  created_at    timestamptz not null default now(),
  settled_at    timestamptz,
  unique (ride_id)
);
create index if not exists idx_payments_payer on public.payments (payer_id, created_at desc);
create index if not exists idx_payments_payee on public.payments (payee_id, created_at desc);

-- ── saved_places: home / work / custom ──────────────────────────────────────
create table if not exists public.saved_places (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  label      text not null,
  kind       text not null default 'custom' check (kind in ('home','work','custom')),
  address    text not null,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_places_user on public.saved_places (user_id, created_at);
create unique index if not exists idx_saved_places_unique_kind
  on public.saved_places (user_id, kind) where kind in ('home','work');

-- ── emergency_contacts ──────────────────────────────────────────────────────
create table if not exists public.emergency_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  name       text not null,
  mobile     text not null,
  relation   text,
  notify_on_ride boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_emergency_user on public.emergency_contacts (user_id);

-- ── sos_alerts ──────────────────────────────────────────────────────────────
create table if not exists public.sos_alerts (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid references public.rides (id) on delete set null,
  user_id    uuid not null references public.users (id) on delete cascade,
  lat        double precision,
  lng        double precision,
  note       text,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_sos_user on public.sos_alerts (user_id, created_at desc);

-- ── trip_shares: capability token for the public live-tracking page ─────────
create table if not exists public.trip_shares (
  token      text primary key default encode(gen_random_bytes(16), 'hex'),
  ride_id    uuid not null references public.rides (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '6 hours'),
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_trip_shares_ride on public.trip_shares (ride_id);

-- ###########################################################################
-- 6. TRIGGERS — audit trail, rating aggregation, ride counters
-- ###########################################################################

create or replace function public.rides_log_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ride_events (ride_id, status, actor_id, meta)
    values (new.id, new.status, new.rider_id, jsonb_build_object('vehicle_type', new.vehicle_type));
  elsif new.status is distinct from old.status then
    insert into public.ride_events (ride_id, status, actor_id, note)
    values (new.id, new.status, auth.uid(), new.cancellation_reason);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_rides_log_event_ins on public.rides;
create trigger trg_rides_log_event_ins after insert on public.rides
  for each row execute function public.rides_log_event();
drop trigger if exists trg_rides_log_event_upd on public.rides;
create trigger trg_rides_log_event_upd after update on public.rides
  for each row execute function public.rides_log_event();

-- Keep users.user_rating / rating_count in sync with the ratings table.
create or replace function public.ratings_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid := coalesce(new.ratee_id, old.ratee_id);
begin
  update public.users u
     set user_rating  = coalesce((select round(avg(stars)::numeric, 1) from public.ratings where ratee_id = target), 5),
         rating_count = (select count(*) from public.ratings where ratee_id = target)
   where u.id = target;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_ratings_recompute on public.ratings;
create trigger trg_ratings_recompute after insert or update or delete on public.ratings
  for each row execute function public.ratings_recompute();

-- Bump lifetime ride counters when a ride completes.
create or replace function public.rides_bump_counters()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.users set total_rides = total_rides + 1 where id = new.rider_id;
    if new.driver_id is not null then
      update public.users set total_rides = total_rides + 1 where id = new.driver_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_rides_bump_counters on public.rides;
create trigger trg_rides_bump_counters after update on public.rides
  for each row execute function public.rides_bump_counters();

-- Fare trigger: keep server-authoritative pricing, but respect a scheduled ride
-- and a surge multiplier, and don't clobber an explicit payment method.
create or replace function public.rides_set_fare()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg record;
begin
  new.distance_km := round(public.haversine_km(new.from_lat, new.from_lng, new.to_lat, new.to_lng)::numeric, 2);
  select * into cfg from public.fare_config where vehicle_type = new.vehicle_type;
  if found then
    new.fare := ceil((cfg.base_fare + new.distance_km * cfg.per_km) * coalesce(new.surge_multiplier, 1));
  end if;
  new.start_otp := null; -- the OTP lives only in public.ride_otps
  if new.scheduled_for is not null and new.scheduled_for > now() + interval '2 minutes' then
    new.status := 'scheduled';
  end if;
  return new;
end;
$$;

-- ###########################################################################
-- 7. STATE-TRANSITION RPCs
--
-- Every meaningful transition is a SECURITY DEFINER function that checks the
-- caller's role on the ride. Clients no longer UPDATE `rides.status` directly,
-- which is what made the old "anyone can edit a pending ride" policy necessary.
-- ###########################################################################

-- ── driver presence ─────────────────────────────────────────────────────────
create or replace function public.driver_heartbeat(
  p_lat double precision default null,
  p_lng double precision default null,
  p_heading double precision default null,
  p_speed double precision default null,
  p_accuracy double precision default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.active_drivers as ad (user_id, is_online, heartbeat_at, last_active_at,
                                           current_lat, current_lng, heading, speed_kmh, accuracy_m, last_updated)
  values (auth.uid(), true, now(), now(), p_lat, p_lng, p_heading, p_speed, p_accuracy, now())
  on conflict (user_id) do update
    set heartbeat_at   = now(),
        last_active_at = now(),
        last_updated   = now(),
        current_lat    = coalesce(excluded.current_lat, ad.current_lat),
        current_lng    = coalesce(excluded.current_lng, ad.current_lng),
        heading        = coalesce(excluded.heading, ad.heading),
        speed_kmh      = coalesce(excluded.speed_kmh, ad.speed_kmh),
        accuracy_m     = coalesce(excluded.accuracy_m, ad.accuracy_m);
end;
$$;
grant execute on function public.driver_heartbeat(double precision, double precision, double precision, double precision, double precision) to authenticated;

create or replace function public.set_driver_duty(p_online boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.active_drivers (user_id, is_online, heartbeat_at, last_active_at)
  values (auth.uid(), p_online, now(), now())
  on conflict (user_id) do update
    set is_online = p_online, heartbeat_at = now(), last_active_at = now();
  return p_online;
end;
$$;
grant execute on function public.set_driver_duty(boolean) to authenticated;

-- ── dispatch ────────────────────────────────────────────────────────────────
-- Nearby pending rides for the calling driver. Runs as definer so drivers never
-- need blanket SELECT on `rides`; it enforces approval, duty state and class.
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
   where d.user_id = auth.uid() and d.verification_status = 'approved';
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
     and r.created_at > now() - interval '15 minutes'
     and public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) <= p_radius_km
   order by public.haversine_km(p_lat, p_lng, r.from_lat, r.from_lng) asc;
end;
$$;
grant execute on function public.nearby_pending_rides(double precision, double precision, text, double precision) to authenticated;

-- Per-class nearest live driver, without exposing any driver's position.
create or replace function public.nearby_driver_summary(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 8
) returns table (vehicle_class text, drivers_online integer, nearest_km double precision)
language sql stable security definer set search_path = public as $$
  select d.vehicle_class,
         count(*)::int,
         min(public.haversine_km(p_lat, p_lng, ad.current_lat, ad.current_lng))
    from public.active_drivers ad
    join public.drivers d on d.user_id = ad.user_id
   where ad.is_online
     and not ad.on_ride
     and d.verification_status = 'approved'
     and ad.current_lat is not null
     and ad.heartbeat_at > now() - public.driver_stale_after()
     and public.haversine_km(p_lat, p_lng, ad.current_lat, ad.current_lng) <= p_radius_km
   group by d.vehicle_class;
$$;
grant execute on function public.nearby_driver_summary(double precision, double precision, double precision) to authenticated;

-- Atomic claim. Returns the ride row or null if someone else got there first.
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public as $$
declare v_ride public.rides; v_ok boolean;
begin
  select exists (
    select 1 from public.drivers d
     where d.user_id = auth.uid() and d.verification_status = 'approved'
  ) into v_ok;
  if not v_ok then raise exception 'not an approved driver' using errcode = '42501'; end if;

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

-- Driver signals arrival at the pickup point.
create or replace function public.mark_driver_arrived(p_ride_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update public.rides
     set status = 'arrived', arrived_at = now()
   where id = p_ride_id and driver_id = auth.uid() and status = 'accepted';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
grant execute on function public.mark_driver_arrived(uuid) to authenticated;

-- OTP start (replaces 0003's version; now also accepts the `arrived` state).
create or replace function public.start_ride(p_ride_id uuid, p_otp text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select exists (
    select 1 from public.rides r
    join public.ride_otps o on o.ride_id = r.id
    where r.id = p_ride_id
      and r.driver_id = auth.uid()
      and r.status in ('accepted','arrived')
      and o.otp = p_otp
  ) into ok;
  if ok then
    update public.rides set status = 'ongoing', started_at = now() where id = p_ride_id;
  end if;
  return ok;
end;
$$;
grant execute on function public.start_ride(uuid, text) to authenticated;

-- Complete a ride: settle the fare, write the payment row, free the driver.
create or replace function public.complete_ride(p_ride_id uuid, p_waiting_minutes integer default 0)
returns public.rides language plpgsql security definer set search_path = public as $$
declare
  v_ride public.rides;
  cfg record;
  v_waiting numeric := 0;
  v_base numeric := 0;
  v_dist numeric := 0;
  v_surge numeric := 0;
  v_total numeric := 0;
  v_platform numeric := 0;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null then raise exception 'ride not found'; end if;
  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'only the assigned driver can complete this ride' using errcode = '42501';
  end if;
  if v_ride.status <> 'ongoing' then return v_ride; end if;

  select * into cfg from public.fare_config where vehicle_type = v_ride.vehicle_type;
  v_base := coalesce(cfg.base_fare, 0);
  v_dist := round(coalesce(v_ride.distance_km, 0) * coalesce(cfg.per_km, 0), 2);
  v_surge := round((v_base + v_dist) * (coalesce(v_ride.surge_multiplier, 1) - 1), 2);
  v_waiting := greatest(0, coalesce(p_waiting_minutes, 0) - 3) * 2;  -- ₹2/min after 3 free minutes
  v_total := ceil(v_base + v_dist + v_surge + v_waiting);
  v_platform := round(v_total * 0.15, 2);

  update public.rides
     set status = 'completed',
         completed_at = now(),
         final_fare = v_total,
         payment_status = case when payment_method = 'cash' then 'paid' else 'pending' end
   where id = p_ride_id
  returning * into v_ride;

  insert into public.payments (ride_id, payer_id, payee_id, method, status,
                               base_fare, distance_fare, surge_amount, waiting_fee,
                               platform_fee, driver_payout, amount, settled_at)
  values (v_ride.id, v_ride.rider_id, v_ride.driver_id, v_ride.payment_method,
          v_ride.payment_status, v_base, v_dist, v_surge, v_waiting,
          v_platform, v_total - v_platform, v_total,
          case when v_ride.payment_status = 'paid' then now() else null end)
  on conflict (ride_id) do update
    set amount = excluded.amount, status = excluded.status, settled_at = excluded.settled_at;

  update public.active_drivers
     set on_ride = false, current_ride_id = null, heartbeat_at = now()
   where user_id = auth.uid();

  return v_ride;
end;
$$;
grant execute on function public.complete_ride(uuid, integer) to authenticated;

-- Cancel with an actor, a reason and a fee policy.
create or replace function public.cancel_ride(p_ride_id uuid, p_reason text default null)
returns public.rides language plpgsql security definer set search_path = public as $$
declare v_ride public.rides; v_fee numeric := 0; v_actor uuid := auth.uid();
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

  -- A rider who cancels more than 2 minutes after a driver accepted pays a
  -- small fee; nobody is charged for cancelling a request nobody accepted.
  if v_actor = v_ride.rider_id
     and v_ride.accepted_at is not null
     and now() - v_ride.accepted_at > interval '2 minutes' then
    v_fee := 30;
  end if;

  update public.rides
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_actor,
         cancellation_reason = p_reason,
         cancellation_fee = v_fee,
         payment_status = case when v_fee > 0 then 'pending' else 'waived' end
   where id = p_ride_id
  returning * into v_ride;

  if v_ride.driver_id is not null then
    update public.active_drivers
       set on_ride = false, current_ride_id = null
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

-- Share the live ETA so rider, driver and notifications quote one number.
create or replace function public.update_ride_eta(
  p_ride_id uuid, p_minutes integer, p_distance_km numeric default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.rides
     set eta_minutes = p_minutes,
         eta_distance_km = coalesce(p_distance_km, eta_distance_km),
         eta_updated_at = now()
   where id = p_ride_id
     and (driver_id = auth.uid() or rider_id = auth.uid())
     and status in ('accepted','arrived','ongoing');
end;
$$;
grant execute on function public.update_ride_eta(uuid, integer, numeric) to authenticated;

-- Expire pending requests nobody took. Callable by the client that owns the
-- ride (so a waiting rider resolves their own stuck request) and by a cron job.
create or replace function public.expire_stale_rides(p_older_than interval default interval '5 minutes')
returns integer language plpgsql security definer set search_path = public as $$
declare v_rows int; v_window interval;
begin
  -- Floor the window so a caller can't wipe out live requests.
  v_window := greatest(coalesce(p_older_than, interval '5 minutes'), interval '3 minutes');
  update public.rides
     set status = 'expired', cancellation_reason = 'No drivers accepted in time'
   where status = 'pending'
     and created_at < now() - v_window;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
grant execute on function public.expire_stale_rides(interval) to authenticated;

-- Release scheduled rides into dispatch when their window opens.
create or replace function public.release_scheduled_rides(p_lead interval default interval '10 minutes')
returns integer language plpgsql security definer set search_path = public as $$
declare v_rows int; v_lead interval;
begin
  -- Cap the lead time so a caller can't release next week's bookings today.
  v_lead := least(greatest(coalesce(p_lead, interval '10 minutes'), interval '0 minutes'), interval '15 minutes');
  update public.rides
     set status = 'pending', created_at = now()
   where status = 'scheduled'
     and scheduled_for is not null
     and scheduled_for <= now() + v_lead;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
grant execute on function public.release_scheduled_rides(interval) to authenticated;

-- ── ratings ─────────────────────────────────────────────────────────────────
create or replace function public.submit_rating(
  p_ride_id uuid, p_stars integer, p_comment text default null,
  p_tags text[] default '{}', p_tip numeric default 0
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_ride public.rides; v_ratee uuid;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride.id is null or v_ride.status <> 'completed' then return false; end if;

  if auth.uid() = v_ride.rider_id then v_ratee := v_ride.driver_id;
  elsif auth.uid() = v_ride.driver_id then v_ratee := v_ride.rider_id;
  else raise exception 'not your ride' using errcode = '42501';
  end if;
  if v_ratee is null then return false; end if;

  insert into public.ratings (ride_id, rater_id, ratee_id, stars, comment, tags, tip_amount)
  values (p_ride_id, auth.uid(), v_ratee, p_stars, p_comment, coalesce(p_tags, '{}'), greatest(0, coalesce(p_tip, 0)))
  on conflict (ride_id, rater_id) do update
    set stars = excluded.stars, comment = excluded.comment,
        tags = excluded.tags, tip_amount = excluded.tip_amount;

  if coalesce(p_tip, 0) > 0 and auth.uid() = v_ride.rider_id then
    update public.rides set tip_amount = p_tip where id = p_ride_id;
    update public.payments
       set tip_amount = p_tip,
           amount = amount + p_tip - coalesce(tip_amount, 0),
           driver_payout = driver_payout + p_tip - coalesce(tip_amount, 0)
     where ride_id = p_ride_id;
  end if;
  return true;
end;
$$;
grant execute on function public.submit_rating(uuid, integer, text, text[], numeric) to authenticated;

-- ── earnings ────────────────────────────────────────────────────────────────
create or replace function public.driver_earnings_summary(
  p_from timestamptz default (now() - interval '30 days'),
  p_to   timestamptz default now()
) returns table (
  trips integer, gross numeric, payout numeric, tips numeric,
  platform_fee numeric, online_minutes integer, distance_km numeric
) language sql stable security definer set search_path = public as $$
  select coalesce(count(p.id), 0)::int,
         coalesce(sum(p.amount), 0),
         coalesce(sum(p.driver_payout), 0),
         coalesce(sum(p.tip_amount), 0),
         coalesce(sum(p.platform_fee), 0),
         0,
         coalesce(sum(r.distance_km), 0)
    from public.payments p
    join public.rides r on r.id = p.ride_id
   where p.payee_id = auth.uid()
     and r.status = 'completed'
     and p.created_at between p_from and p_to;
$$;
grant execute on function public.driver_earnings_summary(timestamptz, timestamptz) to authenticated;

create or replace function public.driver_earnings_daily(p_days integer default 14)
returns table (day date, trips integer, payout numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('day', p.created_at)::date as day,
         count(*)::int,
         coalesce(sum(p.driver_payout), 0)
    from public.payments p
    join public.rides r on r.id = p.ride_id
   where p.payee_id = auth.uid()
     and r.status = 'completed'
     and p.created_at > now() - (p_days || ' days')::interval
   group by 1
   order by 1;
$$;
grant execute on function public.driver_earnings_daily(integer) to authenticated;

-- ── trip sharing ────────────────────────────────────────────────────────────
create or replace function public.create_trip_share(p_ride_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not exists (
    select 1 from public.rides where id = p_ride_id
       and (rider_id = auth.uid() or driver_id = auth.uid())
  ) then raise exception 'not your ride' using errcode = '42501'; end if;

  select token into v_token from public.trip_shares
   where ride_id = p_ride_id and created_by = auth.uid()
     and not revoked and expires_at > now()
   limit 1;
  if v_token is not null then return v_token; end if;

  insert into public.trip_shares (ride_id, created_by) values (p_ride_id, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;
grant execute on function public.create_trip_share(uuid) to authenticated;

create or replace function public.revoke_trip_share(p_ride_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.trip_shares set revoked = true
   where ride_id = p_ride_id and created_by = auth.uid();
$$;
grant execute on function public.revoke_trip_share(uuid) to authenticated;

-- Read-only public view of a shared trip. Deliberately narrow: status, the two
-- endpoints, the driver's first name, vehicle and live position — no phone
-- numbers, no rider identity, no fare.
create or replace function public.get_shared_trip(p_token text)
returns table (
  ride_id uuid, status text, from_address text, to_address text,
  from_lat double precision, from_lng double precision,
  to_lat double precision, to_lng double precision,
  driver_name text, vehicle_type text, vehicle_registration text,
  driver_lat double precision, driver_lng double precision,
  eta_minutes integer, updated_at timestamptz
) language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.from_address, r.to_address,
         r.from_lat, r.from_lng, r.to_lat, r.to_lng,
         split_part(coalesce(u.name, 'Driver'), ' ', 1),
         d.vehicle_type, d.vehicle_registration,
         ad.current_lat, ad.current_lng, r.eta_minutes,
         greatest(coalesce(ad.heartbeat_at, r.created_at), r.created_at)
    from public.trip_shares ts
    join public.rides r          on r.id = ts.ride_id
    left join public.users u     on u.id = r.driver_id
    left join public.drivers d   on d.user_id = r.driver_id
    left join public.active_drivers ad on ad.user_id = r.driver_id
   where ts.token = p_token
     and not ts.revoked
     and ts.expires_at > now();
$$;
grant execute on function public.get_shared_trip(text) to anon, authenticated;

-- ── SOS ─────────────────────────────────────────────────────────────────────
create or replace function public.raise_sos(
  p_ride_id uuid default null, p_lat double precision default null,
  p_lng double precision default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_other uuid;
begin
  insert into public.sos_alerts (ride_id, user_id, lat, lng, note)
  values (p_ride_id, auth.uid(), p_lat, p_lng, p_note)
  returning id into v_id;

  -- Tell the counterparty an alert was raised, so it is visible in-app too.
  if p_ride_id is not null then
    select case when rider_id = auth.uid() then driver_id else rider_id end
      into v_other from public.rides where id = p_ride_id;
    if v_other is not null then
      insert into public.notifications (user_id, type, title, body, url)
      values (v_other, 'sos', 'Emergency alert raised',
              'Your ride partner triggered an SOS. Emergency contacts have been notified.',
              '/rides/' || p_ride_id);
    end if;
  end if;
  return v_id;
end;
$$;
grant execute on function public.raise_sos(uuid, double precision, double precision, text) to authenticated;

-- ── login existence check without exposing the users table to anon ──────────
create or replace function public.mobile_exists(p_mobile text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
     where mobile = right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10)
  );
$$;
grant execute on function public.mobile_exists(text) to anon, authenticated;

-- ── carpool: atomic seat accounting ─────────────────────────────────────────
create or replace function public.accept_ride_request(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_req public.ride_requests; v_ride public.published_rides; v_rider public.users;
begin
  select * into v_req from public.ride_requests where id = p_request_id for update;
  if v_req.id is null then return false; end if;

  select * into v_ride from public.published_rides
   where id = v_req.published_ride_id and driver_id = auth.uid() for update;
  if v_ride.id is null then raise exception 'not your published ride' using errcode = '42501'; end if;
  if v_req.status <> 'pending' then return false; end if;
  if v_ride.available_seats < v_req.seats_requested then return false; end if;

  select * into v_rider from public.users where id = v_req.rider_id;

  update public.ride_requests set status = 'accepted' where id = p_request_id;
  update public.published_rides
     set available_seats = available_seats - v_req.seats_requested,
         accepted_riders = accepted_riders || jsonb_build_object(
           'user_id', v_req.rider_id, 'name', v_rider.name, 'mobile', v_rider.mobile,
           'seats', v_req.seats_requested,
           'pickup', jsonb_build_object('lat', v_req.pickup_lat, 'lng', v_req.pickup_lng),
           'drop',   jsonb_build_object('lat', v_req.drop_lat,   'lng', v_req.drop_lng)),
         updated_at = now()
   where id = v_ride.id;

  insert into public.notifications (user_id, type, title, body, url)
  values (v_req.rider_id, 'carpool', 'Your carpool request was accepted',
          'The driver accepted your seat request.', '/activity');
  return true;
end;
$$;
grant execute on function public.accept_ride_request(uuid) to authenticated;

create or replace function public.reject_ride_request(p_request_id uuid, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_req public.ride_requests;
begin
  select r.* into v_req from public.ride_requests r
    join public.published_rides pr on pr.id = r.published_ride_id
   where r.id = p_request_id and pr.driver_id = auth.uid();
  if v_req.id is null then return false; end if;
  update public.ride_requests set status = 'rejected' where id = p_request_id;
  insert into public.notifications (user_id, type, title, body, url)
  values (v_req.rider_id, 'carpool', 'Carpool request declined',
          coalesce(p_reason, 'The driver could not take this request.'), '/activity');
  return true;
end;
$$;
grant execute on function public.reject_ride_request(uuid, text) to authenticated;

create or replace function public.remove_carpool_rider(p_published_ride_id uuid, p_rider_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ride public.published_rides; v_entry jsonb; v_seats int := 0;
begin
  select * into v_ride from public.published_rides
   where id = p_published_ride_id and driver_id = auth.uid() for update;
  if v_ride.id is null then return false; end if;

  select e into v_entry from jsonb_array_elements(v_ride.accepted_riders) e
   where (e->>'user_id')::uuid = p_rider_id limit 1;
  if v_entry is null then return false; end if;
  v_seats := coalesce((v_entry->>'seats')::int, 0);

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

-- ── driver self-approval guard ──────────────────────────────────────────────
-- `drivers_write_own` is a `for all` policy, so without this a driver could
-- simply UPDATE their own row to verification_status = 'approved'. Applicants
-- may only move a rejected application back to pending (a resubmission).
create or replace function public.drivers_guard_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.verification_status := 'pending';
    new.verified_at := null;
    new.verified_by := null;
  elsif new.verification_status is distinct from old.verification_status
        and not public.is_admin()
        and not (old.verification_status = 'rejected' and new.verification_status = 'pending') then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_drivers_guard on public.drivers;
create trigger trg_drivers_guard before insert or update on public.drivers
  for each row execute function public.drivers_guard_verification();

-- ── admin: driver verification ──────────────────────────────────────────────
create or replace function public.set_driver_verification(
  p_driver_id uuid, p_status text, p_reason text default null
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_status not in ('pending','approved','rejected') then
    raise exception 'invalid status';
  end if;

  update public.drivers
     set verification_status = p_status,
         rejection_reason = case when p_status = 'rejected' then p_reason else null end,
         verified_at = case when p_status = 'approved' then now() else null end,
         verified_by = auth.uid(),
         updated_at = now()
   where user_id = p_driver_id;

  insert into public.notifications (user_id, type, title, body, url)
  values (p_driver_id, 'driver',
          case p_status when 'approved' then 'You''re approved to drive'
                        when 'rejected' then 'Driver application needs attention'
                        else 'Driver application received' end,
          case p_status when 'approved' then 'Go online from the driver dashboard to start earning.'
                        when 'rejected' then coalesce(p_reason, 'Please review your documents and reapply.')
                        else 'We are reviewing your documents.' end,
          '/driver/activate');
  return true;
end;
$$;
grant execute on function public.set_driver_verification(uuid, text, text) to authenticated;

create or replace function public.admin_pending_drivers()
returns table (
  user_id uuid, name text, mobile text, verification_status text,
  license_number text, license_expiry date, vehicle_registration text,
  vehicle_type text, vehicle_class text, document_url text, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select d.user_id, u.name, u.mobile, d.verification_status,
         d.license_number, d.license_expiry, d.vehicle_registration,
         d.vehicle_type, d.vehicle_class, d.document_url, d.created_at
    from public.drivers d
    join public.users u on u.id = d.user_id
   where public.is_admin()
   order by (d.verification_status = 'pending') desc, d.created_at desc;
$$;
grant execute on function public.admin_pending_drivers() to authenticated;

-- ── one-call trip history for both roles ────────────────────────────────────
create or replace function public.my_rides(
  p_role text default 'all', p_status text default 'all',
  p_limit integer default 20, p_offset integer default 0
) returns table (
  id uuid, role text, status text, from_address text, to_address text,
  vehicle_type text, distance_km numeric, fare numeric, final_fare numeric,
  payment_method text, payment_status text, created_at timestamptz,
  completed_at timestamptz, counterpart_name text, counterpart_rating numeric,
  my_rating integer
) language sql stable security definer set search_path = public as $$
  select r.id,
         case when r.rider_id = auth.uid() then 'rider' else 'driver' end as role,
         r.status, r.from_address, r.to_address, r.vehicle_type,
         r.distance_km, r.fare, r.final_fare, r.payment_method, r.payment_status,
         r.created_at, r.completed_at,
         cu.name, cu.user_rating,
         (select rt.stars from public.ratings rt
           where rt.ride_id = r.id and rt.rater_id = auth.uid())
    from public.rides r
    left join public.users cu
           on cu.id = case when r.rider_id = auth.uid() then r.driver_id else r.rider_id end
   where (r.rider_id = auth.uid() or r.driver_id = auth.uid())
     and (p_role = 'all'
          or (p_role = 'rider'  and r.rider_id  = auth.uid())
          or (p_role = 'driver' and r.driver_id = auth.uid()))
     and (p_status = 'all' or r.status = p_status)
   order by r.created_at desc
   limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
$$;
grant execute on function public.my_rides(text, text, integer, integer) to authenticated;

-- ###########################################################################
-- 8. PRIVILEGES + RLS
-- ###########################################################################

grant select, insert, update, delete
  on public.user_settings, public.saved_places, public.emergency_contacts,
     public.ratings, public.sos_alerts
  to authenticated;
grant select on public.payments, public.ride_events, public.trip_shares to authenticated;

alter table public.user_settings      enable row level security;
alter table public.saved_places       enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.ratings            enable row level security;
alter table public.payments           enable row level security;
alter table public.ride_events        enable row level security;
alter table public.sos_alerts         enable row level security;
alter table public.trip_shares        enable row level security;

drop policy if exists "settings_own" on public.user_settings;
create policy "settings_own" on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "places_own" on public.saved_places;
create policy "places_own" on public.saved_places for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "contacts_own" on public.emergency_contacts;
create policy "contacts_own" on public.emergency_contacts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ratings are written through submit_rating(); reads are scoped to the two
-- people involved so a driver can see the feedback they received.
drop policy if exists "ratings_read" on public.ratings;
create policy "ratings_read" on public.ratings for select to authenticated
  using (auth.uid() = rater_id or auth.uid() = ratee_id);

drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments for select to authenticated
  using (auth.uid() = payer_id or auth.uid() = payee_id);

drop policy if exists "events_read" on public.ride_events;
create policy "events_read" on public.ride_events for select to authenticated
  using (exists (select 1 from public.rides r
                  where r.id = ride_id
                    and (r.rider_id = auth.uid() or r.driver_id = auth.uid())));

drop policy if exists "sos_own" on public.sos_alerts;
create policy "sos_own" on public.sos_alerts for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "shares_own" on public.trip_shares;
create policy "shares_own" on public.trip_shares for select to authenticated
  using (auth.uid() = created_by);

-- ── users: stop anonymous enumeration, scope reads to people you deal with ──
revoke select on public.users from anon;
drop policy if exists "users_select_all" on public.users;
drop policy if exists "users_select_scoped" on public.users;
create policy "users_select_scoped" on public.users for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    -- the other party on a ride we share
    or exists (select 1 from public.rides r
                where (r.rider_id = auth.uid() and r.driver_id = users.id)
                   or (r.driver_id = auth.uid() and r.rider_id = users.id))
    -- a driver publishing a carpool the rider can discover
    or exists (select 1 from public.published_rides pr
                where pr.driver_id = users.id and pr.status = 'active')
    -- someone who requested a seat on our published carpool
    or exists (select 1 from public.ride_requests rq
               join public.published_rides pr on pr.id = rq.published_ride_id
                where rq.rider_id = users.id and pr.driver_id = auth.uid())
  );

-- ── active_drivers: only the driver, their current rider, and admins ────────
drop policy if exists "active_select_auth" on public.active_drivers;
drop policy if exists "active_select_scoped" on public.active_drivers;
create policy "active_select_scoped" on public.active_drivers for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.rides r
                where r.driver_id = active_drivers.user_id
                  and r.rider_id = auth.uid()
                  and r.status in ('accepted','arrived','ongoing'))
  );

-- ── rides: own rides, plus a *narrow* dispatch window for on-duty drivers ───
drop policy if exists "rides_select" on public.rides;
drop policy if exists "rides_select_own" on public.rides;
create policy "rides_select_own" on public.rides for select to authenticated
  using (auth.uid() = rider_id or auth.uid() = driver_id or public.is_admin());

-- Realtime `postgres_changes` honours RLS, so on-duty drivers need SELECT on
-- the pending rides they are eligible for — but only those: same service class,
-- within 8 km of their last known position, approved and not already on a job.
drop policy if exists "rides_select_dispatch" on public.rides;
create policy "rides_select_dispatch" on public.rides for select to authenticated
  using (
    status = 'pending'
    and exists (
      select 1
        from public.active_drivers ad
        join public.drivers d on d.user_id = ad.user_id
       where ad.user_id = auth.uid()
         and ad.is_online
         and not ad.on_ride
         and d.verification_status = 'approved'
         and d.vehicle_class = rides.vehicle_type
         and ad.current_lat is not null
         and public.haversine_km(ad.current_lat, ad.current_lng, rides.from_lat, rides.from_lng) <= 8
    )
  );

-- The old policy allowed *any* authenticated user to UPDATE *any* pending ride
-- (`using (… or status = 'pending') with check (true)`). Claiming a ride now
-- goes through accept_ride(); direct updates are limited to your own rides.
drop policy if exists "rides_update" on public.rides;
drop policy if exists "rides_update_own" on public.rides;
create policy "rides_update_own" on public.rides for update to authenticated
  using (auth.uid() = rider_id or auth.uid() = driver_id)
  with check (auth.uid() = rider_id or auth.uid() = driver_id);

-- ── drivers: admins may verify ──────────────────────────────────────────────
drop policy if exists "drivers_admin_write" on public.drivers;
create policy "drivers_admin_write" on public.drivers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── notifications: only ride counterparties, and only about a live ride ─────
drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications for insert to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.rides r
       where r.status in ('pending','accepted','arrived','ongoing','completed','cancelled')
         and ((r.rider_id = auth.uid()  and r.driver_id = notifications.user_id)
           or (r.driver_id = auth.uid() and r.rider_id  = notifications.user_id))
    )
  );

-- ###########################################################################
-- 9. REALTIME
-- ###########################################################################
do $$
begin
  execute 'alter publication supabase_realtime add table public.ride_events';
exception when duplicate_object then null;
end $$;

-- Give the realtime stream the full old row on UPDATE/DELETE so clients can
-- diff status transitions (otherwise `old` only carries the primary key).
alter table public.rides replica identity full;

-- ###########################################################################
-- 10. BACKFILL
-- ###########################################################################

-- Settings row for everyone who already exists.
insert into public.user_settings (user_id)
select id from public.users
on conflict (user_id) do nothing;

-- Lifecycle timestamps for rides that predate this migration.
update public.rides
   set completed_at = coalesce(completed_at, created_at)
 where status = 'completed' and completed_at is null;

-- Payment rows for already-completed rides, so history and earnings are not empty.
insert into public.payments (ride_id, payer_id, payee_id, method, status,
                             base_fare, distance_fare, platform_fee, driver_payout,
                             amount, created_at, settled_at)
select r.id, r.rider_id, r.driver_id, coalesce(r.payment_method, 'cash'), 'paid',
       coalesce(fc.base_fare, 0),
       round(coalesce(r.distance_km, 0) * coalesce(fc.per_km, 0), 2),
       round(coalesce(r.fare, 0) * 0.15, 2),
       coalesce(r.fare, 0) - round(coalesce(r.fare, 0) * 0.15, 2),
       coalesce(r.fare, 0), r.created_at, coalesce(r.completed_at, r.created_at)
  from public.rides r
  left join public.fare_config fc on fc.vehicle_type = r.vehicle_type
 where r.status = 'completed' and r.driver_id is not null
on conflict (ride_id) do nothing;

-- Lifetime ride counters.
update public.users u
   set total_rides = coalesce((
         select count(*) from public.rides r
          where r.status = 'completed' and (r.rider_id = u.id or r.driver_id = u.id)), 0);
