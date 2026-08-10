-- =============================================================================
-- CPSM — row-level security.
--
-- The Postgres equivalent of the table permissions in appwrite/setup.mjs, and
-- it preserves that file's central decision: read is granted to a *role*, never
-- merely to "signed in". Appwrite projects allow public sign-up by default, and
-- a self-registered account is still a user — it would have inherited read
-- access to every report while being unable to use the app at all. The same
-- reasoning holds here, so every policy names the roles explicitly.
--
-- Sign-up is also switched off in the dashboard. Both, not either alone.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The caller's role, read from the JWT.
--
-- It lives in app_metadata, which only the service key can write — so a user
-- with update rights on their own profile row still cannot promote themselves.
-- That is exactly the guarantee the Appwrite label-based scheme provided.
--
-- An account carrying no role yields '', which matches nothing below and so
-- grants nothing anywhere.
-- -----------------------------------------------------------------------------
create or replace function public.auth_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

alter table public.profiles  enable row level security;
alter table public.reports   enable row level security;
alter table public.shipments enable row level security;
alter table public.settings  enable row level security;

-- -----------------------------------------------------------------------------
-- Table privileges, underneath the policies.
--
-- Supabase grants every new public table to anon and authenticated by default.
-- The policies below already deny anon, but a role that cannot reach the table
-- at all is a second, independent barrier — and the grants document which
-- operations the browser is ever expected to perform.
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.reports, public.shipments, public.settings
  from anon;

-- Clients never create or delete a profile: api/admin-users does that with the
-- service key, exactly as the Appwrite function does today.
grant select, update                 on public.profiles  to authenticated;
grant select, insert, update, delete on public.reports   to authenticated;
grant select, insert, update, delete on public.shipments to authenticated;
grant select, update                 on public.settings  to authenticated;

-- -----------------------------------------------------------------------------
-- profiles — your own row, or any row if you are an administrator.
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.auth_role() = 'admin');

create policy profiles_update on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()) or public.auth_role() = 'admin')
  with check (id = (select auth.uid()) or public.auth_role() = 'admin');

-- -----------------------------------------------------------------------------
-- reports — viewer reads; dispatch also creates and updates; only admin deletes.
-- -----------------------------------------------------------------------------
create policy reports_select on public.reports
  for select to authenticated
  using (public.auth_role() in ('admin','dispatch','viewer'));

create policy reports_insert on public.reports
  for insert to authenticated
  with check (public.auth_role() in ('admin','dispatch'));

create policy reports_update on public.reports
  for update to authenticated
  using      (public.auth_role() in ('admin','dispatch'))
  with check (public.auth_role() in ('admin','dispatch'));

create policy reports_delete on public.reports
  for delete to authenticated
  using (public.auth_role() = 'admin');

-- -----------------------------------------------------------------------------
-- shipments — same shape as reports: dispatch logs what arrives, admin removes.
-- -----------------------------------------------------------------------------
create policy shipments_select on public.shipments
  for select to authenticated
  using (public.auth_role() in ('admin','dispatch','viewer'));

create policy shipments_insert on public.shipments
  for insert to authenticated
  with check (public.auth_role() in ('admin','dispatch'));

create policy shipments_update on public.shipments
  for update to authenticated
  using      (public.auth_role() in ('admin','dispatch'))
  with check (public.auth_role() in ('admin','dispatch'));

create policy shipments_delete on public.shipments
  for delete to authenticated
  using (public.auth_role() = 'admin');

-- -----------------------------------------------------------------------------
-- settings — everyone signed in reads it; only an administrator changes it.
--
-- No insert or delete policy: the single row is created by 0001 and is not the
-- app's to remove.
-- -----------------------------------------------------------------------------
create policy settings_select on public.settings
  for select to authenticated
  using (public.auth_role() in ('admin','dispatch','viewer'));

create policy settings_update on public.settings
  for update to authenticated
  using      (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');
