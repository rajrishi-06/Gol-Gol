-- ============================================================================
-- Gol·Gol — driver documents live in private storage, not on the open web
--
-- Applying to drive asked for a "Document link", with the hint: *"Google Drive,
-- Dropbox, etc. — make sure it's viewable by anyone with the link."* That is
-- the application telling a driver to publish their own licence — full name,
-- address, date of birth, licence number, photograph — to anyone who guesses or
-- is given the URL, and to leave it published for as long as they drive. It
-- also meant the platform never held the document: an admin approved against a
-- link that the applicant could swap out or revoke the moment approval landed.
--
-- Documents now go to a private bucket. The applicant may write only into their
-- own folder, only they and an admin may read it, and the admin console fetches
-- a short-lived signed URL rather than holding a permanent one.
--
-- Supabase's `storage` schema does not exist on a stock Postgres, so the whole
-- section is guarded — the migration is a no-op locally, which is how the test
-- suite proves the chain still applies.
-- ============================================================================

-- The path inside the bucket, e.g. `<user_id>/licence-1699.jpg`. Kept separate
-- from `document_url` so applications made before this migration still show
-- their link to an admin instead of turning into a broken download.
alter table public.drivers
  add column if not exists document_path text;

comment on column public.drivers.document_path is
  'Object path in the private driver-docs bucket. Read via a signed URL; never public.';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent — skipping bucket and policies (local run)';
    return;
  end if;

  -- `public = false`: no object in here is reachable without a signed URL.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('driver-docs', 'driver-docs', false, 10485760,
          array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
  on conflict (id) do update
    set public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- The first path segment is the owner's id, which is what every policy keys
  -- on: `<uid>/licence.jpg` is writable by that uid and nobody else.
  execute $p$drop policy if exists "driver_docs_insert_own" on storage.objects$p$;
  execute $p$
    create policy "driver_docs_insert_own" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'driver-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  execute $p$drop policy if exists "driver_docs_update_own" on storage.objects$p$;
  execute $p$
    create policy "driver_docs_update_own" on storage.objects for update to authenticated
      using (
        bucket_id = 'driver-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  execute $p$drop policy if exists "driver_docs_delete_own" on storage.objects$p$;
  execute $p$
    create policy "driver_docs_delete_own" on storage.objects for delete to authenticated
      using (
        bucket_id = 'driver-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  -- Reading is the applicant and the people who verify them. `is_admin()` is a
  -- definer function, so this does not re-enter any public policy.
  execute $p$drop policy if exists "driver_docs_read_own_or_admin" on storage.objects$p$;
  execute $p$
    create policy "driver_docs_read_own_or_admin" on storage.objects for select to authenticated
      using (
        bucket_id = 'driver-docs'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
        )
      )
  $p$;
end $$;

-- ###########################################################################
-- The admin console needs the path to sign, and the legacy link to fall back to
-- ###########################################################################

drop function if exists public.admin_pending_drivers();
create or replace function public.admin_pending_drivers()
returns table (
  user_id uuid, name text, mobile text, verification_status text,
  license_number text, license_expiry date, vehicle_registration text,
  vehicle_type text, vehicle_class text, document_url text, document_path text,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select d.user_id, u.name, u.mobile, d.verification_status,
         d.license_number, d.license_expiry, d.vehicle_registration,
         d.vehicle_type, d.vehicle_class, d.document_url, d.document_path,
         d.created_at
    from public.drivers d
    join public.users u on u.id = d.user_id
   where public.is_admin()
   order by (d.verification_status = 'pending') desc, d.created_at desc;
$$;
grant execute on function public.admin_pending_drivers() to authenticated;

-- ###########################################################################
-- An application needs a document, in one form or the other
--
-- `document_url` was never actually required by the database — only by the
-- form, which is a rule that holds until someone posts to PostgREST directly.
-- Nothing stopped an approved driver having no document at all.
--
-- `not valid` so an existing project with such rows can still apply this; new
-- writes are checked from here on.
-- ###########################################################################

alter table public.drivers drop constraint if exists drivers_document_present;
alter table public.drivers
  add constraint drivers_document_present check (
    verification_status <> 'approved'
    or document_url is not null
    or document_path is not null
  ) not valid;
