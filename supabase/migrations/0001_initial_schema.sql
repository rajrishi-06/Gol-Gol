-- ============================================================================
-- Gol·Gol — full database schema
-- Run this once against a fresh Supabase project (SQL Editor → paste → Run,
-- or `supabase db push`). Reproduces every table, relationship, RLS policy,
-- realtime channel and trigger the app relies on.
-- ============================================================================

-- ------------------------------------------------------------------ tables ---

create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default 'Rider',
  email       text,
  mobile      text unique,
  is_driver   boolean not null default false,
  user_rating numeric(2,1) not null default 5,
  created_at  timestamptz not null default now()
);

create table if not exists public.drivers (
  user_id              uuid primary key references public.users (id) on delete cascade,
  verification_status  text not null default 'pending'
                         check (verification_status in ('pending','approved','rejected')),
  license_number       text,
  license_expiry       date,
  vehicle_registration text,
  vehicle_type         text check (vehicle_type in ('car','bike','auto','van','truck')),
  document_url         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.active_drivers (
  user_id         uuid primary key references public.drivers (user_id) on delete cascade,
  is_online       boolean not null default false,
  on_ride         boolean not null default false,
  current_ride_id uuid,
  current_lat     double precision,
  current_lng     double precision,
  last_active_at  timestamptz,
  last_updated    timestamptz default now()
);

create table if not exists public.rides (
  id           uuid primary key default gen_random_uuid(),
  rider_id     uuid not null references public.users (id) on delete cascade,
  driver_id    uuid references public.users (id) on delete set null,
  from_lat     double precision not null,
  from_lng     double precision not null,
  to_lat       double precision not null,
  to_lng       double precision not null,
  from_address text,
  to_address   text,
  vehicle_type text,
  distance_km  numeric,
  fare         numeric,
  status       text not null default 'pending'
                 check (status in ('pending','accepted','ongoing','completed','cancelled')),
  start_otp    text,
  created_at   timestamptz not null default now()
);

create table if not exists public.published_rides (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references public.users (id) on delete cascade,
  from_lat        double precision not null,
  from_lng        double precision not null,
  to_lat          double precision not null,
  to_lng          double precision not null,
  from_address    text,
  to_address      text,
  available_seats integer not null default 1,
  distance_km     numeric,
  fare_per_seat   numeric,
  notes           text,
  status          text not null default 'active'
                    check (status in ('active','completed','cancelled')),
  departure_time  timestamptz,
  accepted_riders jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.ride_requests (
  id                uuid primary key default gen_random_uuid(),
  published_ride_id uuid not null references public.published_rides (id) on delete cascade,
  rider_id          uuid not null references public.users (id) on delete cascade,
  seats_requested   integer not null default 1,
  status            text not null default 'pending'
                      check (status in ('pending','accepted','rejected','removed')),
  pickup_lat        double precision,
  pickup_lng        double precision,
  drop_lat          double precision,
  drop_lng          double precision,
  min_price         numeric,
  preferred_vehicle text,
  notes             text,
  max_distance      numeric,
  created_at        timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides (id) on delete cascade,
  sender_id  uuid not null references public.users (id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- indexes ---
create index if not exists idx_rides_status         on public.rides (status);
create index if not exists idx_rides_rider          on public.rides (rider_id);
create index if not exists idx_rides_driver         on public.rides (driver_id);
create index if not exists idx_active_drivers_online on public.active_drivers (is_online, on_ride);
create index if not exists idx_pub_rides_status     on public.published_rides (status);
create index if not exists idx_requests_pub_ride    on public.ride_requests (published_ride_id);
create index if not exists idx_chat_ride            on public.chat_messages (ride_id, created_at);

-- ------------------------------------------- auth.users -> public.users -----
-- Creates a profile row on signup, deriving the 10-digit mobile from the
-- phone-OTP identity and name/email from the signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, mobile)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Rider'),
    nullif(new.raw_user_meta_data->>'email', ''),
    right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- privileges --
grant usage on schema public to anon, authenticated;
-- Login checks whether a mobile already exists before the user authenticates.
grant select on public.users to anon;
grant select, update on public.users to authenticated;
grant select, insert, update, delete
  on public.drivers, public.active_drivers, public.rides,
     public.published_rides, public.ride_requests, public.chat_messages
  to authenticated;

-- --------------------------------------------------------------------- RLS ---
alter table public.users            enable row level security;
alter table public.drivers          enable row level security;
alter table public.active_drivers   enable row level security;
alter table public.rides            enable row level security;
alter table public.published_rides  enable row level security;
alter table public.ride_requests    enable row level security;
alter table public.chat_messages    enable row level security;

-- users: readable (for name lookups + login existence check); own row editable.
create policy "users_select_all"   on public.users for select using (true);
create policy "users_update_own"   on public.users for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- drivers: readable by signed-in users; a driver manages only their own row.
create policy "drivers_select_auth" on public.drivers for select to authenticated using (true);
create policy "drivers_write_own"   on public.drivers for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- active_drivers: readable (ETA + live tracking); a driver manages only theirs.
create policy "active_select_auth"  on public.active_drivers for select to authenticated using (true);
create policy "active_write_own"    on public.active_drivers for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- rides: rider/driver see their ride; drivers see open (pending) requests.
create policy "rides_select"  on public.rides for select to authenticated
  using (auth.uid() = rider_id or auth.uid() = driver_id or status = 'pending');
create policy "rides_insert"  on public.rides for insert to authenticated
  with check (auth.uid() = rider_id);
create policy "rides_update"  on public.rides for update to authenticated
  using (auth.uid() = rider_id or auth.uid() = driver_id or status = 'pending')
  with check (true);
create policy "rides_delete"  on public.rides for delete to authenticated
  using (auth.uid() = rider_id);

-- published_rides: discoverable by riders; managed only by the owning driver.
create policy "pub_select_auth" on public.published_rides for select to authenticated using (true);
create policy "pub_write_own"   on public.published_rides for all to authenticated
  using (auth.uid() = driver_id) with check (auth.uid() = driver_id);

-- ride_requests: visible to the requester and the owning driver; requester creates.
create policy "req_select" on public.ride_requests for select to authenticated
  using (
    auth.uid() = rider_id
    or exists (select 1 from public.published_rides pr
               where pr.id = published_ride_id and pr.driver_id = auth.uid())
  );
create policy "req_insert" on public.ride_requests for insert to authenticated
  with check (auth.uid() = rider_id);
create policy "req_update" on public.ride_requests for update to authenticated
  using (
    auth.uid() = rider_id
    or exists (select 1 from public.published_rides pr
               where pr.id = published_ride_id and pr.driver_id = auth.uid())
  ) with check (true);

-- chat_messages: only the two people on the ride can read/write.
create policy "chat_select" on public.chat_messages for select to authenticated
  using (exists (select 1 from public.rides r
                 where r.id = ride_id and (r.rider_id = auth.uid() or r.driver_id = auth.uid())));
create policy "chat_insert" on public.chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.rides r
                where r.id = ride_id and (r.rider_id = auth.uid() or r.driver_id = auth.uid()))
  );

-- ---------------------------------------------------------------- realtime ---
-- The app subscribes to postgres_changes on these tables.
do $$
begin
  execute 'alter publication supabase_realtime add table public.rides';
  execute 'alter publication supabase_realtime add table public.chat_messages';
  execute 'alter publication supabase_realtime add table public.ride_requests';
  execute 'alter publication supabase_realtime add table public.active_drivers';
  execute 'alter publication supabase_realtime add table public.published_rides';
exception when duplicate_object then null;
end $$;
