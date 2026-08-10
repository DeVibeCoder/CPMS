-- =============================================================================
-- CPSM — Supabase schema.
--
-- The Postgres equivalent of appwrite/setup.mjs. Unlike that script this is not
-- idempotent and is not meant to be re-run: it is a migration, applied once, in
-- order. Run 0001 then 0002 in the SQL editor.
--
-- Column names are snake_case. The repository already maps store rows to domain
-- objects, so the camelCase TypeScript types in src/types are untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — the editable part of a user record, keyed to the auth account.
--
-- Deliberately holds no privileged field. The role lives in the account's
-- app_metadata and "active" is the account's own banned state, neither of which
-- a client can write. A user may therefore edit their own profile row freely
-- without being able to promote themselves — the same property the Appwrite
-- schema had, where the role was an account label rather than a table column.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  display_name  text,
  username      text,
  avatar_color  text,
  -- Profile pictures are stored inline as data URLs, so this can reach ~1 MB.
  avatar_url    text,
  last_login    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- reports — one row per report date.
--
-- The id is text rather than uuid so the existing Appwrite ids carry across
-- verbatim: /reports/:id bookmarks keep working, and the migration verifier can
-- compare the two databases row for row by id. At this volume a text key costs
-- nothing.
--
-- One report per day was a unique index in Appwrite; here it is a constraint on
-- a real date column, so a malformed date cannot be stored in the first place.
-- -----------------------------------------------------------------------------
create table public.reports (
  id              text primary key default gen_random_uuid()::text,
  date            date not null unique,
  status          text not null check (status in ('draft','final')),
  -- The whole ReportData object. jsonb rather than the varchar(100000) Appwrite
  -- forced on us: validated on write, queryable, and no arbitrary size ceiling.
  data            jsonb not null,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  updated_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- shipments — cement received into the silos, one row per date.
--
-- Its own table rather than a column on reports: cement arrives when a vessel
-- does, not on the daily reporting cycle. Logging a second amount for a date
-- corrects the first rather than adding to it, which the unique constraint makes
-- a guarantee rather than a convention the UI happens to follow.
-- -----------------------------------------------------------------------------
create table public.shipments (
  id              text primary key default gen_random_uuid()::text,
  date            date not null unique,
  amount_mt       double precision not null,
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- settings — exactly one row, which the primary key check enforces.
--
-- The six branding columns from the Appwrite schema (company_name, report_title,
-- pdf_header, pdf_footer, logo_data_url, bag_weight_mt) are not recreated. They
-- are already dead: those values are constants in src/config/brand.ts and
-- CompanySettings no longer declares them. setup.mjs left them in place because
-- dropping columns from a live plant database is risk without benefit; a fresh
-- schema carries no such risk.
--
-- cement_opening_balance is the bin-card anchor: the one stock figure entered by
-- hand, from which every later balance is derived by walking finalised reports
-- forward.
-- -----------------------------------------------------------------------------
create table public.settings (
  id                      text primary key default 'app' check (id = 'app'),
  default_theme           text not null default 'system'
                            check (default_theme in ('light','dark','system')),
  cement_opening_balance  double precision,
  cement_opening_date     date,
  updated_at              timestamptz not null default now()
);

insert into public.settings (id) values ('app') on conflict do nothing;

-- -----------------------------------------------------------------------------
-- updated_at is maintained by the database rather than by every call site that
-- happens to remember. search_path is pinned empty so the function cannot be
-- redirected by a caller's search path.
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch  before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger reports_touch   before update on public.reports
  for each row execute function public.touch_updated_at();
create trigger shipments_touch before update on public.shipments
  for each row execute function public.touch_updated_at();
create trigger settings_touch  before update on public.settings
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Report History lists by month and the bin card walks dates in order, so both
-- read the tables newest-first over a date range.
-- -----------------------------------------------------------------------------
create index reports_date_desc   on public.reports (date desc);
create index shipments_date_desc on public.shipments (date desc);
