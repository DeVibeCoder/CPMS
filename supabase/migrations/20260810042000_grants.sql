-- =============================================================================
-- Tighten table privileges for `authenticated`.
--
-- 0002 granted the operations the browser is expected to perform, but a grant
-- is additive and Supabase had already granted ALL on every new public table to
-- anon, authenticated and service_role by default. The revoke in 0002 named
-- only anon, so `authenticated` kept INSERT and DELETE on profiles and settings
-- — operations no policy allows, but which the grant layer should not be
-- offering either.
--
-- Nothing was exposed: row-level security denies both, because neither table
-- has an insert or a delete policy. This restores the second, independent
-- barrier that 0002 intended, so that a future policy added carelessly cannot
-- by itself open up an operation the browser was never meant to perform.
--
-- service_role is deliberately left alone: api/admin-users creates and deletes
-- profile rows with it, exactly as the Appwrite function does today.
-- =============================================================================

revoke all on public.profiles, public.reports, public.shipments, public.settings
  from authenticated;

-- Clients never create or delete a profile — the service key does that.
grant select, update                 on public.profiles  to authenticated;
grant select, insert, update, delete on public.reports   to authenticated;
grant select, insert, update, delete on public.shipments to authenticated;
-- The single settings row is created by the schema and is not the app's to drop.
grant select, update                 on public.settings  to authenticated;
