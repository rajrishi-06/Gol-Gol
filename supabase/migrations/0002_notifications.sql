-- ============================================================================
-- Gol·Gol — notifications + Web Push subscriptions (Phase 3)
-- Adds an in-app notification feed (realtime) and stores Web Push endpoints.
-- ============================================================================

-- ------------------------------------------------------------------ tables ---
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       text not null default 'info',
  title      text not null,
  body       text,
  url        text,
  data       jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- indexes ---
create index if not exists idx_notifications_user   on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (user_id) where not read;
create index if not exists idx_push_subs_user       on public.push_subscriptions (user_id);

-- --------------------------------------------------------------- privileges --
grant select, insert, update, delete
  on public.notifications, public.push_subscriptions
  to authenticated;

-- --------------------------------------------------------------------- RLS ---
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;

-- notifications: you read/update/delete only your own; you may create one for
-- yourself OR for the other party on a ride you're on (so a driver can notify
-- their rider and vice versa without a server round-trip).
create policy "notif_select_own" on public.notifications for select to authenticated
  using (auth.uid() = user_id);
create policy "notif_update_own" on public.notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notif_delete_own" on public.notifications for delete to authenticated
  using (auth.uid() = user_id);
create policy "notif_insert" on public.notifications for insert to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.rides r
      where (r.rider_id = auth.uid()  and r.driver_id = notifications.user_id)
         or (r.driver_id = auth.uid() and r.rider_id  = notifications.user_id)
    )
  );

-- push_subscriptions: a user manages only their own device endpoints.
create policy "push_all_own" on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- realtime ---
do $$
begin
  execute 'alter publication supabase_realtime add table public.notifications';
exception when duplicate_object then null;
end $$;
