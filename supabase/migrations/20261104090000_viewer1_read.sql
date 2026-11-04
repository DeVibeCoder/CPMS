-- =============================================================================
-- CPSM — Viewer 1: read-only Dashboard, Analytics and Attendance.
--
-- Viewer 1 (`viewer1` in app_metadata.role) is narrower than viewer: it opens
-- Dashboard, Analytics and Attendance and nothing else, and changes nothing.
-- The application's capability map says so (src/store/auth.ts); these policies
-- are the database half — every existing policy names its roles, so a new role
-- reaches no row until one names it.
--
-- Select only, everywhere. Postgres combines permissive policies with OR, so
-- each of these adds read access for viewer1 and leaves every existing policy,
-- and every other role's access, exactly as it was. No insert, update or delete
-- policy names viewer1, so its writes are refused.
--
--   reports   — Dashboard and Analytics are built from them.
--   settings  — the app loads it at sign-in; the Dashboard waits on it.
--   attendance_* — the Attendance screens, read-only.
--
-- Not shipments: that feeds Inventory, which Viewer 1 does not open. Not
-- profiles: the existing policy already lets every account read its own row.
--
-- The table grants to `authenticated` are unchanged; policies decide who inside
-- that role reaches a row.
-- =============================================================================

create policy reports_select_viewer1 on public.reports
  for select to authenticated
  using (public.auth_role() = 'viewer1');

create policy settings_select_viewer1 on public.settings
  for select to authenticated
  using (public.auth_role() = 'viewer1');

create policy attendance_employees_select_viewer1 on public.attendance_employees
  for select to authenticated
  using (public.auth_role() = 'viewer1');

create policy attendance_departures_select_viewer1 on public.attendance_departures
  for select to authenticated
  using (public.auth_role() = 'viewer1');

create policy attendance_entries_select_viewer1 on public.attendance_entries
  for select to authenticated
  using (public.auth_role() = 'viewer1');

create policy attendance_chart_select_viewer1 on public.attendance_chart
  for select to authenticated
  using (public.auth_role() = 'viewer1');

create policy attendance_days_select_viewer1 on public.attendance_days
  for select to authenticated
  using (public.auth_role() = 'viewer1');
