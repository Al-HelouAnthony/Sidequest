-- =============================================================================
-- 00_create_table.sql: raw import table for businesses.csv (Ville de Montréal
-- food-establishment open data). Run this FIRST, then 01..NN in order.
-- Raw reference data only: the app's feed reads public.places, not this table.
-- Safe to run more than once.
-- =============================================================================
create table if not exists public.businesses (
  business_id integer primary key,
  name        text not null,
  address     text not null,
  city        text not null,
  state       text not null,
  type        text not null,
  statut      text not null,
  date_statut date not null,
  latitude    double precision,
  longitude   double precision,
  x           double precision,
  y           double precision,
  created_at  timestamptz not null default now()
);

create index if not exists businesses_type_statut_idx on public.businesses (type, statut);

-- RLS on every table (team rule). No policies = only the server (service role) can read it.
alter table public.businesses enable row level security;
grant all on public.businesses to service_role;
