-- Minimal stand-ins for the Supabase platform objects the migrations assume.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  phone text,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The session's current user id, settable per-connection like Supabase's JWT claim.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function test_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
$$;

drop publication if exists supabase_realtime;
create publication supabase_realtime;

-- ── assertion harness ───────────────────────────────────────────────────────
--
-- `chk` counts itself. Every test file ends with `select expect(N)`, and a
-- mismatch fails the run.
--
-- That matters more than it looks: `select chk(...) from <join>` does nothing
-- at all when the join is empty, so an assertion can silently not run and the
-- suite still reports success. One did — the check that a heading-home
-- destination lands on the trip never executed, and nothing said so.

create table if not exists _assertions (id boolean primary key default true check (id), n integer not null default 0);
insert into _assertions (id, n) values (true, 0) on conflict (id) do update set n = 0;

create or replace function chk(label text, got anyelement, want anyelement) returns void
language plpgsql as $$
begin
  update _assertions set n = n + 1;
  if got is not distinct from want then raise notice 'PASS  % (%)', label, got;
  else raise notice 'FAIL  % — got %, wanted %', label, got, want; end if;
end $$;

create or replace function near(a double precision, b double precision, tol double precision default 0.05)
returns boolean language sql immutable as $$ select abs(a - b) <= tol $$;

create or replace function expect(want integer) returns void language plpgsql as $$
declare got integer;
begin
  select n into got from _assertions;
  if got = want then raise notice 'PASS  ran all % assertions', got;
  else raise notice 'FAIL  only % of % assertions ran — one was skipped silently', got, want; end if;
end $$;
