-- =============================================================================
-- 00_create_table.sql: public.events, one table for both event sources. Owner: Adel.
--   source = 'montreal_open_data'  -> evenements.csv (montreal.ca/evenements). Dates only, no times.
--   source = 'ticketmaster'        -> Ticketmaster Discovery API v2. Exact start time in start_at.
-- Run this FIRST, then the *_data.sql files (any order). Re-running everything is safe:
-- rows are upserted on (source, source_id), so a re-import refreshes status/prices.
-- Raw reference data: the feed engine does not read this table yet.
-- =============================================================================
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('montreal_open_data', 'ticketmaster')),
  source_id     text not null,                       -- montreal: url_fiche; ticketmaster: event id
  title         text not null check (length(trim(title)) > 0),
  description   text not null default '',
  url           text,
  event_type    text,                                -- montreal: type_evenement; ticketmaster: segment
  genre         text,                                -- ticketmaster: genre
  audience      text,                                -- montreal: public_cible
  setting       text,                                -- montreal: emplacement (En salle / À l'extérieur / En ligne)
  registration  text,                                -- montreal: inscription
  is_free       boolean,                             -- null = unknown
  price_min     numeric(10, 2),
  price_max     numeric(10, 2),
  currency      text,
  start_date    date not null,                       -- local (Montréal) date
  end_date      date not null,
  start_at      timestamptz,                         -- exact start (ticketmaster only)
  status        text,                                -- ticketmaster: onsale / offsale / canceled / postponed / rescheduled
  venue_name    text,
  address       text,
  postal_code   text,
  borough       text,                                -- montreal: arrondissement
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  image_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (source, source_id),
  check (end_date >= start_date)
);

create index if not exists events_dates_idx on public.events (start_date, end_date);
create index if not exists events_start_at_idx on public.events (start_at);

-- RLS on every table (team rule). No policies = only the server (service role) can read/write.
alter table public.events enable row level security;
grant all on public.events to service_role;
