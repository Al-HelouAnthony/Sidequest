-- 0007: G2 Google Calendar tokens, G4 memory photos, G5 live location (PLAN.md §13). Owner: Adel.
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- Access model: every table here is SERVER ONLY. RLS is on with NO policies and anon/authenticated
-- have no grants, so only the service role (API routes, after their own membership checks) can
-- read or write. The browser never sees a Google token or another member's coordinates: the
-- location API returns status / distance / ETA only (PLAN.md §13 privacy rules).

-- ---- G2: Google refresh tokens (long-lived; never sent to the browser, never logged) ----
create table if not exists public.google_tokens (
  user_id       uuid primary key references public.users (id) on delete cascade,
  refresh_token text not null check (length(refresh_token) > 0),
  scope         text,
  updated_at    timestamptz not null default now()
);
alter table public.google_tokens enable row level security;
revoke all on public.google_tokens from anon, authenticated;
grant all on public.google_tokens to service_role;
drop trigger if exists google_tokens_set_updated_at on public.google_tokens;
create trigger google_tokens_set_updated_at before update on public.google_tokens
  for each row execute function public.set_updated_at();

-- ---- G2: which Google Calendar event belongs to each member's RSVP (to delete it on "out") ----
alter table public.plan_members add column if not exists google_event_id text;

-- ---- G5: live location, one row per member per plan; deleted after the plan ends ----
create table if not exists public.plan_locations (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m >= 0),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
alter table public.plan_locations enable row level security;
revoke all on public.plan_locations from anon, authenticated;
grant all on public.plan_locations to service_role;
drop trigger if exists plan_locations_set_updated_at on public.plan_locations;
create trigger plan_locations_set_updated_at before update on public.plan_locations
  for each row execute function public.set_updated_at();

-- ---- G4: memory photos (files in the private plan-photos bucket, rows here) ----
create table if not exists public.plan_photos (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  path       text not null unique check (length(path) > 0), -- {planId}/{uuid}.jpg inside the bucket
  created_at timestamptz not null default now()
);
create index if not exists plan_photos_plan_created_idx on public.plan_photos (plan_id, created_at);
alter table public.plan_photos enable row level security;
revoke all on public.plan_photos from anon, authenticated;
grant all on public.plan_photos to service_role;

-- ---- G4: private bucket. No storage.objects policies: only the service role uploads, and members
-- get short-lived signed URLs from GET /api/plans/[id]/photos. ----
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets not found (not a Supabase database?): bucket plan-photos skipped';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('plan-photos', 'plan-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
end
$$;
