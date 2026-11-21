-- =============================================================================
-- 0003_place_photos_bucket.sql: Storage bucket for place photos (PLAN.md D4). Owner: Adel.
--
-- Public bucket: place photos are meant to be seen by everyone (feed cards load them with a
-- plain <img>), so objects are served at
--   <SUPABASE_URL>/storage/v1/object/public/place-photos/places/<place_id>.jpg
-- and places.photo_url stores that public URL.
--
-- Writes: NO storage.objects policies are created on purpose. Only the service role (server,
-- bypasses RLS) can upload, replace or delete; the anon/authenticated keys cannot write.
-- Only freely licensed images go here; credits live in data/photo-credits.md.
--
-- Apply after 0001/0002 (SQL Editor -> paste -> Run). Safe to run more than once.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-photos', 'place-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
