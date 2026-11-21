-- =============================================================================
-- 0001_init.sql: Sidequest schema + Row Level Security. Owner: Adel.
--
-- How to apply (no Supabase CLI in this repo): Supabase dashboard → SQL Editor →
-- paste this whole file → Run. Run it ONCE on a fresh project.
--
-- Conventions
--  - snake_case here; lib/data/mappers.js converts to the camelCase shapes in types/domain.js.
--  - All timestamps are timestamptz (stored UTC). Busy blocks are end-exclusive [start_at, end_at).
--  - CHECK constraints mirror the Zod enums in types/domain.js. Change both together.
--  - users.id has NO foreign key to auth.users: seeded demo friends never sign in.
--    On first Google login the app inserts a users row with id = auth.uid().
--
-- Access model
--  - The Next.js server reads/writes through the service-role client (lib/supabase/admin.js),
--    which bypasses RLS, and scopes every query by the session user (getSessionUserId()).
--    That is required in DEMO_MODE, where the browser is not a Supabase-authenticated user.
--  - RLS is still ON for every table: it blocks the public anon key and protects real
--    Google-authenticated users. Every operation has an explicit policy; anything without
--    a policy is denied (only the service role can do it).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.users (
  id          uuid primary key,
  name        text not null check (length(trim(name)) > 0),
  avatar_url  text not null default '',
  home_lat    double precision not null check (home_lat between -90 and 90),
  home_lng    double precision not null check (home_lng between -180 and 180),
  interests   text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.friendships (
  user_id    uuid not null references public.users (id) on delete cascade,
  friend_id  uuid not null references public.users (id) on delete cascade,
  closeness  smallint not null check (closeness between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
-- "Who has me as a friend?" (used by the users / busy_blocks policies).
create index friendships_friend_id_idx on public.friendships (friend_id);

create table public.busy_blocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  source     text not null check (source in ('google', 'manual', 'seed')),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index busy_blocks_user_start_idx on public.busy_blocks (user_id, start_at);

create table public.places (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(trim(name)) > 0),
  category             text not null check (category in ('cafe', 'restaurant', 'bar', 'park', 'viewpoint', 'activity', 'event')),
  tags                 text[] not null default '{}',
  lat                  double precision not null check (lat between -90 and 90),
  lng                  double precision not null check (lng between -180 and 180),
  address              text not null default '',
  price_level          smallint not null check (price_level between 1 and 4),
  photo_url            text not null default '',
  -- { "mon": [{"open":"09:00","close":"17:00"}], ... }. Missing weekday = closed.
  -- close < open = closes after midnight. Validated by the Place Zod schema.
  hours                jsonb not null default '{}'::jsonb check (jsonb_typeof(hours) = 'object'),
  typical_duration_min integer not null check (typical_duration_min > 0),
  indoor               boolean not null,
  created_at           timestamptz not null default now()
);

create table public.travel_times (
  user_id     uuid not null references public.users (id) on delete cascade,
  place_id    uuid not null references public.places (id) on delete cascade,
  -- OpenRouteService profile names (no public transit in ORS).
  mode        text not null check (mode in ('foot-walking', 'cycling-regular', 'driving-car')),
  minutes     integer not null check (minutes >= 0),
  -- true = haversine fallback, not a real route (UI shows "~").
  is_estimate boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (user_id, place_id, mode)
);
create index travel_times_place_id_idx on public.travel_times (place_id);

create table public.interactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  slot_start timestamptz not null,
  action     text not null check (action in ('skip', 'save', 'go')),
  created_at timestamptz not null default now()
);
create index interactions_user_created_idx on public.interactions (user_id, created_at desc);
create index interactions_place_id_idx on public.interactions (place_id);

create table public.user_tag_weights (
  user_id    uuid not null references public.users (id) on delete cascade,
  -- Place tags ("coffee") and category keys ("cat:bar") from lib/engine/learning.js.
  tag        text not null check (length(tag) > 0),
  -- Clamped to [LEARNING.min, LEARNING.max] = [-1, 1] in lib/engine/config.js.
  weight     double precision not null default 0 check (weight between -1 and 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, tag)
);

create table public.plans (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  status     text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index plans_creator_id_idx on public.plans (creator_id);
create index plans_place_id_idx on public.plans (place_id);

create table public.plan_members (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  rsvp       text not null default 'invited' check (rsvp in ('invited', 'in', 'out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index plan_members_user_id_idx on public.plan_members (user_id);

-- updated_at triggers
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger user_tag_weights_set_updated_at before update on public.user_tag_weights
  for each row execute function public.set_updated_at();
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger plan_members_set_updated_at before update on public.plan_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

-- Is the current user the creator or a member of this plan?
-- SECURITY DEFINER so the plan_members policy can call it without recursing into itself.
create or replace function public.is_plan_member(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plan_members m
    where m.plan_id = p_plan_id and m.user_id = (select auth.uid())
  ) or exists (
    select 1 from public.plans p
    where p.id = p_plan_id and p.creator_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_plan_member(uuid) from public, anon;
grant execute on function public.is_plan_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: ON for every table
-- ---------------------------------------------------------------------------
alter table public.users            enable row level security;
alter table public.friendships      enable row level security;
alter table public.busy_blocks      enable row level security;
alter table public.places           enable row level security;
alter table public.travel_times     enable row level security;
alter table public.interactions     enable row level security;
alter table public.user_tag_weights enable row level security;
alter table public.plans            enable row level security;
alter table public.plan_members     enable row level security;

-- users: read yourself and your friends (either direction). Insert/update only yourself.
-- No delete policy (service role only).
create policy "users: select self or friends" on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (select 1 from public.friendships f
               where f.user_id = (select auth.uid()) and f.friend_id = users.id)
    or exists (select 1 from public.friendships f
               where f.friend_id = (select auth.uid()) and f.user_id = users.id)
  );
create policy "users: insert self (first login)" on public.users
  for insert to authenticated
  with check (id = (select auth.uid()));
create policy "users: update self" on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- friendships: see rows you are part of; manage only your own outgoing rows.
create policy "friendships: select own" on public.friendships
  for select to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy "friendships: insert own" on public.friendships
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "friendships: update own" on public.friendships
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "friendships: delete own" on public.friendships
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- busy_blocks: read your own + your friends' (the feed needs them). Write only your own.
create policy "busy_blocks: select own or friends" on public.busy_blocks
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.friendships f
               where f.user_id = (select auth.uid()) and f.friend_id = busy_blocks.user_id)
  );
create policy "busy_blocks: insert own" on public.busy_blocks
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "busy_blocks: update own" on public.busy_blocks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "busy_blocks: delete own" on public.busy_blocks
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- places: public catalogue, readable by everyone. No write policies (service role only).
create policy "places: select all" on public.places
  for select to anon, authenticated
  using (true);

-- travel_times: read your own. Written by the seed (service role) only.
create policy "travel_times: select own" on public.travel_times
  for select to authenticated
  using (user_id = (select auth.uid()));

-- interactions: read + insert your own. No update/delete.
create policy "interactions: select own" on public.interactions
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "interactions: insert own" on public.interactions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- user_tag_weights: full control of your own rows only.
create policy "user_tag_weights: select own" on public.user_tag_weights
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "user_tag_weights: insert own" on public.user_tag_weights
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "user_tag_weights: update own" on public.user_tag_weights
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "user_tag_weights: delete own" on public.user_tag_weights
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- plans / plan_members: members (and the creator) can read. Writes go through the
-- server with the service role after checking membership (PLAN.md S1), so no write policies.
create policy "plans: select if member" on public.plans
  for select to authenticated
  using (public.is_plan_member(id));
create policy "plan_members: select if member" on public.plan_members
  for select to authenticated
  using (public.is_plan_member(plan_id));

-- ---------------------------------------------------------------------------
-- Realtime (for Mhammad, PLAN.md S2)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.plans, public.plan_members;
