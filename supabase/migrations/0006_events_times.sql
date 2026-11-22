-- 0006: exact event times + a lookup key for event place ids. Owner: Adel. Safe to re-run.
-- Paste into the Supabase SQL Editor and run.
--
-- end_at:    exact end from the montreal.ca page (start_at already exists). Filled by
--            supabase/import/events/fetch_event_times.mjs.
-- place_key: last 12 hex digits of id. Events show up in the app as places with id
--            "50000000-0000-4000-8000-<place_key>" (Anthony's format); uuids can't be searched by
--            suffix, so this stored column + index lets eventPlaceById() find the row.
do $$
begin
  if to_regclass('public.events') is null then
    raise notice 'public.events does not exist yet: run supabase/import/events/00_create_table.sql first, then re-run this file';
    return;
  end if;
  execute 'alter table public.events add column if not exists end_at timestamptz';
  execute 'alter table public.events add column if not exists place_key text generated always as (right(id::text, 12)) stored';
  execute 'create index if not exists events_place_key_idx on public.events (place_key)';
  if not exists (select 1 from pg_constraint where conname = 'events_end_after_start') then
    execute 'alter table public.events add constraint events_end_after_start check (end_at is null or start_at is null or end_at > start_at)';
  end if;
end
$$;
