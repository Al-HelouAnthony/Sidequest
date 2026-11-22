-- 0008: G6e, faster registry search on public.businesses (~55k rows). Owner: Adel. Safe to re-run.
-- Paste into the Supabase SQL Editor and run (the index builds take a few seconds).
--
-- What the app runs (lib/data/db.js findRegistryRows / findRegistryRowsByName):
--   statut = 'Ouvert' AND type ILIKE 'Restaurant%' AND latitude/longitude BETWEEN <6 km box>
--   AND (name ILIKE '%indien%' OR name ILIKE '%curry%' …)      -- cuisine search
--   AND name ILIKE '%b__st_n%' …                               -- name search (accent-tolerant)
--
-- 1. Trigram GIN index on name: lets Postgres answer name ILIKE '%word%' from the index instead of
--    scanning every row. Indexed on name itself (not lower(name)): pg_trgm serves ILIKE directly,
--    and an index on lower(name) would only be used by queries written with lower().
-- 2. Partial btree on (latitude, longitude) for open businesses: the 6 km box then reads a few
--    thousand rows instead of 55k (helps the name search, whose "_" wildcards trigrams can't use).
do $$
declare
  trgm_schema text;
begin
  if to_regclass('public.businesses') is null then
    raise notice 'public.businesses does not exist yet: run supabase/import/businesses/00_create_table.sql first';
    return;
  end if;
  -- Supabase keeps extensions in the "extensions" schema; reuse pg_trgm wherever it already is.
  create extension if not exists pg_trgm with schema extensions;
  select n.nspname into trgm_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';
  execute format('create index if not exists businesses_name_trgm_idx on public.businesses using gin (name %I.gin_trgm_ops)', trgm_schema);
  execute 'create index if not exists businesses_open_geo_idx on public.businesses (latitude, longitude) where statut = ''Ouvert''';
  execute 'analyze public.businesses';
end
$$;

-- Before/after check (run these on their own in the SQL Editor; look at "Execution Time"):
-- explain analyze select business_id, name from public.businesses
--   where statut = 'Ouvert' and type ilike 'Restaurant%'
--     and latitude between 45.45 and 45.56 and longitude between -73.65 and -73.50
--     and (name ilike '%indien%' or name ilike '%curry%' or name ilike '%tandoori%');
-- explain analyze select business_id, name from public.businesses
--   where statut = 'Ouvert' and type ilike 'Restaurant%'
--     and latitude between 45.45 and 45.56 and longitude between -73.65 and -73.50
--     and name ilike '%b__st_n%';
