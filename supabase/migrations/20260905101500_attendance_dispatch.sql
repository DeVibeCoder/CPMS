-- =============================================================================
-- CPSM — Attendance for dispatch.
--
-- Attendance shipped administrator-only. The plant has since decided that
-- dispatch runs it too: dispatch is who is at the gate when a shift starts, and
-- a timesheet only an administrator can fill in is a timesheet filled in a day
-- late. The application's capability map now says so (src/store/auth.ts), and
-- these policies are the same rule stated where a REST client with the anon key
-- cannot get round it.
--
-- The whole module, not a read-only corner of it. Splitting it finer — dispatch
-- may enter hours but not book the vacation that displaces them — would leave
-- half of one action needing somebody else, and the timesheet writes its own
-- rows from a booking, so the two cannot be separated in the database either.
--
-- Viewers are still nowhere in these policies. Attendance is not part of what a
-- read-only reporting account looks at, and `attendance` stays false for them in
-- the capability map.
--
-- Policies are replaced rather than loosened in place: Postgres has no "alter
-- policy ... using" that reads clearly next to the original, and dropping and
-- recreating leaves the file saying the whole rule rather than a diff of it.
-- The grants from 0004 already cover `authenticated` as a whole and are
-- unchanged — the policies are what decide who inside that role reaches a row.
-- =============================================================================

drop policy if exists attendance_employees_all  on public.attendance_employees;
drop policy if exists attendance_departures_all on public.attendance_departures;
drop policy if exists attendance_entries_all    on public.attendance_entries;
drop policy if exists attendance_chart_all      on public.attendance_chart;
drop policy if exists attendance_days_select    on public.attendance_days;
drop policy if exists attendance_days_insert    on public.attendance_days;
drop policy if exists attendance_days_delete    on public.attendance_days;

create policy attendance_employees_all on public.attendance_employees
  for all to authenticated
  using      (public.auth_role() in ('admin','dispatch'))
  with check (public.auth_role() in ('admin','dispatch'));

create policy attendance_departures_all on public.attendance_departures
  for all to authenticated
  using      (public.auth_role() in ('admin','dispatch'))
  with check (public.auth_role() in ('admin','dispatch'));

create policy attendance_entries_all on public.attendance_entries
  for all to authenticated
  using      (public.auth_role() in ('admin','dispatch'))
  with check (public.auth_role() in ('admin','dispatch'));

create policy attendance_chart_all on public.attendance_chart
  for all to authenticated
  using      (public.auth_role() in ('admin','dispatch'))
  with check (public.auth_role() in ('admin','dispatch'));

-- A day is signed off and reopened, never edited in place, so attendance_days
-- still has no update policy.
create policy attendance_days_select on public.attendance_days
  for select to authenticated
  using (public.auth_role() in ('admin','dispatch'));

create policy attendance_days_insert on public.attendance_days
  for insert to authenticated
  with check (public.auth_role() in ('admin','dispatch'));

create policy attendance_days_delete on public.attendance_days
  for delete to authenticated
  using (public.auth_role() in ('admin','dispatch'));
