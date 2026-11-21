-- 0004: link places to Google Places, and let signed-in users read events. Owner: Adel.
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- places.google_place_id: Google lets us store place IDs indefinitely. We deliberately do NOT store
-- photo names (Google: "You cannot cache a photo name. Also, the name can expire."); /api/photo looks
-- up a fresh one per request. Attribution is returned live by /api/photo?format=json for the same reason.
alter table public.places add column if not exists google_place_id text;
create unique index if not exists places_google_place_id_key on public.places (google_place_id);

-- events (created by supabase/import/events/00_create_table.sql, not a migration): RLS was on with
-- no policies (server only). Signed-in users may now read it; writes stay service-role only.
do $$
begin
  if to_regclass('public.events') is null then
    raise notice 'public.events does not exist yet: run supabase/import/events/00_create_table.sql, then re-run this file';
    return;
  end if;
  execute 'grant select on public.events to authenticated';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_select_authenticated') then
    execute 'create policy events_select_authenticated on public.events for select to authenticated using (true)';
  end if;
end
$$;
