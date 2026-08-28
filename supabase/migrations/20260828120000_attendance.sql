-- =============================================================================
-- CPSM — Attendance.
--
-- The module ran on invented data held in one browser's local storage while its
-- rules were being settled. They are settled, so this is the schema that takes
-- it live: the staff list, what is booked against them, the hours they worked,
-- the days signed off, and who holds which post on the organisational chart.
--
-- Tables are prefixed `attendance_`. `employees` on its own would sit next to
-- `profiles` and read as though the two were the same thing, and they are not —
-- a profile is somebody who signs into CPSM, an employee is somebody the plant
-- pays. Most of the plant is the second and none of the first.
--
-- Column names are snake_case; the mapping to the camelCase domain types lives
-- in src/data/attendance and nowhere else.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- attendance_employees — the staff list.
--
-- The primary key is the plant's own staff number, not a generated id. It is
-- what a supervisor writes on a paper sheet, what an imported spreadsheet is
-- keyed on, and what every hour recorded here hangs off. Stored upper case by
-- the application, which is the one spelling the whole module uses.
--
-- Nobody is deleted when they leave: an exit is a row in attendance_departures
-- and the person stays here, because the weeks they worked are still weeks the
-- plant paid for. Deleting an employee is for a row entered by mistake, and the
-- cascades below are what make that clean rather than something to remember.
-- -----------------------------------------------------------------------------
create table public.attendance_employees (
  id          text primary key,
  name        text not null,
  department  text not null,
  position    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- attendance_departures — every booked spell away, and every exit.
--
-- One table rather than four, because a supervisor recording any of them is
-- doing the same thing: writing down a date somebody will not be at work. The
-- only real difference is that an exit has no end, and that is a constraint
-- here rather than a convention the application happens to follow.
--
-- Rows are written weeks ahead of the dates they cover, which is why they are
-- not simply a status on the timesheet: the timesheet rows for those days do
-- not exist yet.
-- -----------------------------------------------------------------------------
create table public.attendance_departures (
  id          text primary key default gen_random_uuid()::text,
  employee_id text not null
                references public.attendance_employees(id) on delete cascade,
  type        text not null check (type in ('vacation','sick','off-site','exit')),
  from_date   date not null,
  -- Inclusive. Null means open-ended: somebody signed off sick with no return
  -- date is still sick tomorrow.
  to_date     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint attendance_departures_exit_is_one_way
    check (type <> 'exit' or to_date is null),
  constraint attendance_departures_ends_after_it_starts
    check (to_date is null or to_date >= from_date)
);

create index attendance_departures_employee
  on public.attendance_departures (employee_id, from_date);

-- -----------------------------------------------------------------------------
-- attendance_entries — one person, one day.
--
-- The key is the pair, so a day cannot be recorded twice for the same person.
--
-- Times are "HH:mm" text rather than `time`, because that is what the domain
-- holds and what any sheet will send: a `time` column would hand back
-- "07:00:00" and every reader would have to trim it. The check constraint is
-- what keeps that text honest.
--
-- Every column but the pair is optional in practice. A sick day has no times; a
-- day somebody clocked in for and never out of has only a start. Neither is the
-- same as "worked nothing", which is why the totals treat an unreadable pair as
-- unknown rather than zero.
-- -----------------------------------------------------------------------------
create table public.attendance_entries (
  employee_id text not null
                references public.attendance_employees(id) on delete cascade,
  date        date not null,
  start_time  text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time    text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Every gap in the day, in the order they happened: [{from,to,reason}]. A
  -- plant's gaps are not all the lunch break — production stopping for rain is
  -- a gap too, and what matters is when, not just how long.
  breaks      jsonb not null default '[]'::jsonb,
  status      text not null default 'present'
                check (status in ('present','sick','vacation','off-site')),
  remarks     text,
  -- Written from a booked departure rather than typed. It is what lets a
  -- withdrawn departure take its rows away again without touching a day
  -- somebody actually worked. See src/lib/attendance/autoStatus.ts.
  auto        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (employee_id, date)
);

-- The timesheet reads one day across everybody; the master sheet reads a range.
create index attendance_entries_date on public.attendance_entries (date desc);

-- -----------------------------------------------------------------------------
-- attendance_days — the days that have been signed off.
--
-- A day's presence here is the whole meaning of "completed": the master sheet
-- shows only these, and the automatic status rule will not rewrite them. A day
-- still being filled in has no business in a sheet people read figures off.
--
-- Reopening a day deletes the row rather than flagging it, so the table is the
-- answer to the question rather than a log of the question being asked.
-- -----------------------------------------------------------------------------
create table public.attendance_days (
  date         date primary key,
  submitted_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id) on delete set null
);

-- -----------------------------------------------------------------------------
-- attendance_chart — who holds which post.
--
-- The posts themselves are not here. A chart is a set of posts the plant has
-- decided exist, and that shape is fixed and lives in the code
-- (src/lib/attendance/orgChart.ts); what changes is who fills them. Keeping the
-- shape out of the database is also what makes a vacancy expressible: a post
-- with nobody in it is simply a slot with no row.
--
-- One post each way. Without the unique constraint one person could be put in
-- two boxes and the chart would report a headcount the plant does not have.
-- -----------------------------------------------------------------------------
create table public.attendance_chart (
  slot_id     text primary key,
  employee_id text not null unique
                references public.attendance_employees(id) on delete cascade,
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at is maintained by the database rather than by every call site that
-- happens to remember. Reuses the function 0001 defined.
-- -----------------------------------------------------------------------------
create trigger attendance_employees_touch  before update
  on public.attendance_employees  for each row
  execute function public.touch_updated_at();

create trigger attendance_departures_touch before update
  on public.attendance_departures for each row
  execute function public.touch_updated_at();

create trigger attendance_entries_touch    before update
  on public.attendance_entries    for each row
  execute function public.touch_updated_at();

create trigger attendance_chart_touch      before update
  on public.attendance_chart      for each row
  execute function public.touch_updated_at();

-- =============================================================================
-- Row-level security.
--
-- Attendance is administrator-only, which is what the application's own
-- capability map says (src/store/auth.ts) and what the route guard enforces.
-- These policies are the same rule stated where it cannot be got round: a
-- dispatch account with a REST client and the anon key reaches nothing here.
--
-- Every policy names the role explicitly rather than granting to "signed in",
-- for the reason 0002 gives at length: a signed-in account is not by itself an
-- authorised one.
--
-- When the plant opens attendance up to supervisors, the change is a select
-- policy naming another role — not a loosening of these.
-- =============================================================================
alter table public.attendance_employees  enable row level security;
alter table public.attendance_departures enable row level security;
alter table public.attendance_entries    enable row level security;
alter table public.attendance_days       enable row level security;
alter table public.attendance_chart      enable row level security;

-- Supabase grants ALL on every new public table to anon and authenticated, and
-- a grant is additive — so revoke first and then name what the browser is ever
-- expected to do. The policies below already deny anon; this is the second,
-- independent barrier underneath them.
revoke all on
  public.attendance_employees,
  public.attendance_departures,
  public.attendance_entries,
  public.attendance_days,
  public.attendance_chart
from anon, authenticated;

grant select, insert, update, delete on
  public.attendance_employees,
  public.attendance_departures,
  public.attendance_entries,
  public.attendance_days,
  public.attendance_chart
to authenticated;

-- A day is signed off and reopened, never edited in place, so attendance_days
-- has no update policy. The others are read, written, corrected and removed.
create policy attendance_employees_all on public.attendance_employees
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy attendance_departures_all on public.attendance_departures
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy attendance_entries_all on public.attendance_entries
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy attendance_chart_all on public.attendance_chart
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy attendance_days_select on public.attendance_days
  for select to authenticated
  using (public.auth_role() = 'admin');

create policy attendance_days_insert on public.attendance_days
  for insert to authenticated
  with check (public.auth_role() = 'admin');

create policy attendance_days_delete on public.attendance_days
  for delete to authenticated
  using (public.auth_role() = 'admin');
