-- ============================================================================
-- Gol·Gol — harden auth → public.users profile creation + backfill
-- Fixes: auth.users created before the trigger existed (or whose profile insert
-- hit the `mobile` unique constraint) had no public.users row, so their rides
-- failed the rider_id foreign key ("nothing gets stored").
-- ============================================================================

-- Profile creation must never block a signup: swallow a duplicate-mobile clash
-- (two accounts for the same number in different formats) and still create the
-- profile — just without the conflicting mobile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.users (id, name, email, mobile)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Rider'),
      nullif(new.raw_user_meta_data->>'email', ''),
      right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10)
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.users (id, name, email)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Rider'),
      nullif(new.raw_user_meta_data->>'email', '')
    )
    on conflict (id) do nothing;
  end;
  return new;
end;
$$;

-- One-off backfill for existing auth users with no profile (deduped by mobile).
insert into public.users (id, name, email, mobile)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'name', ''), 'Rider'),
       nullif(u.raw_user_meta_data->>'email', ''),
       right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
from auth.users u
where not exists (select 1 from public.users p where p.id = u.id)
  and not exists (
    select 1 from public.users p2
    where p2.mobile = right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
  )
on conflict do nothing;
