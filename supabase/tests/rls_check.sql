-- =============================================================================
-- rls_check.sql: proves the RLS policies in 0001_init.sql do what we claim.
--
-- How to run: Supabase dashboard → SQL Editor → paste this file → Run.
-- It ALWAYS ends with an error ON PURPOSE: raising an exception rolls back every
-- test row it inserted, so the database is left untouched.
--   "RLS CHECK PASSED (…)"  = all good.
--   "RLS CHECK FAILED: …"   = the listed checks failed. Tell Adel.
-- Safe to run any number of times. Uses throwaway IDs (eeeeeeee-…).
-- =============================================================================
do $$
declare
  me       uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  friend   uuid := 'eeeeeeee-0000-4000-8000-000000000002';
  stranger uuid := 'eeeeeeee-0000-4000-8000-000000000003';
  place    uuid := 'eeeeeeee-0000-4000-8000-0000000000aa';
  plan_ok  uuid := 'eeeeeeee-0000-4000-8000-0000000000b1';
  plan_no  uuid := 'eeeeeeee-0000-4000-8000-0000000000b2';
  n        int;
  failures text[] := '{}';
begin
  -- ---------- setup (as postgres, RLS bypassed) ----------
  insert into public.users (id, name, home_lat, home_lng) values
    (me, 'RLS Me', 45.50, -73.57),
    (friend, 'RLS Friend', 45.52, -73.58),
    (stranger, 'RLS Stranger', 45.48, -73.58);
  insert into public.friendships (user_id, friend_id, closeness) values (me, friend, 3);
  insert into public.busy_blocks (user_id, start_at, end_at, source) values
    (me,       '2026-11-21T14:00:00Z', '2026-11-21T15:00:00Z', 'seed'),
    (friend,   '2026-11-21T14:00:00Z', '2026-11-21T15:00:00Z', 'seed'),
    (stranger, '2026-11-21T14:00:00Z', '2026-11-21T15:00:00Z', 'seed');
  insert into public.places (id, name, category, lat, lng, price_level, typical_duration_min, indoor)
    values (place, 'RLS Test Café', 'cafe', 45.51, -73.57, 1, 60, true);
  insert into public.interactions (user_id, place_id, slot_start, action) values
    (me,       place, '2026-11-21T19:00:00Z', 'save'),
    (stranger, place, '2026-11-21T19:00:00Z', 'skip');
  insert into public.travel_times (user_id, place_id, mode, minutes, is_estimate) values
    (me, place, 'foot-walking', 10, false),
    (stranger, place, 'foot-walking', 20, false);
  insert into public.plans (id, creator_id, place_id, start_at, end_at) values
    (plan_ok, friend,   place, '2026-11-21T19:00:00Z', '2026-11-21T21:00:00Z'),
    (plan_no, stranger, place, '2026-11-21T19:00:00Z', '2026-11-21T21:00:00Z');
  insert into public.plan_members (plan_id, user_id) values (plan_ok, me), (plan_no, friend);

  -- ---------- act as "me", a signed-in user ----------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);

  select count(*) into n from public.users where id = me;
  if n <> 1 then failures := failures || text 'can read own user row'; end if;
  select count(*) into n from public.users where id = friend;
  if n <> 1 then failures := failures || text 'can read friend user row'; end if;
  select count(*) into n from public.users where id = stranger;
  if n <> 0 then failures := failures || text 'cannot read stranger user row'; end if;

  select count(*) into n from public.busy_blocks where user_id = friend;
  if n <> 1 then failures := failures || text 'can read friend busy_blocks'; end if;
  select count(*) into n from public.busy_blocks where user_id = stranger;
  if n <> 0 then failures := failures || text 'cannot read stranger busy_blocks'; end if;

  select count(*) into n from public.interactions where user_id = me;
  if n <> 1 then failures := failures || text 'can read own interactions'; end if;
  select count(*) into n from public.interactions where user_id = stranger;
  if n <> 0 then failures := failures || text 'cannot read stranger interactions'; end if;

  select count(*) into n from public.travel_times where user_id = stranger;
  if n <> 0 then failures := failures || text 'cannot read stranger travel_times'; end if;

  select count(*) into n from public.places where id = place;
  if n <> 1 then failures := failures || text 'authenticated can read places'; end if;

  select count(*) into n from public.plans where id in (plan_ok, plan_no);
  if n <> 1 then failures := failures || text 'sees only plans they belong to'; end if;
  select count(*) into n from public.plan_members where plan_id = plan_no;
  if n <> 0 then failures := failures || text 'cannot read members of a foreign plan'; end if;

  begin
    insert into public.busy_blocks (user_id, start_at, end_at, source)
      values (stranger, '2026-11-22T14:00:00Z', '2026-11-22T15:00:00Z', 'manual');
    failures := failures || text 'cannot insert busy_blocks for someone else';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.busy_blocks (user_id, start_at, end_at, source)
      values (me, '2026-11-22T14:00:00Z', '2026-11-22T15:00:00Z', 'google');
  exception when others then
    failures := failures || ('can insert own google busy_block: ' || sqlerrm);
  end;

  begin
    insert into public.places (name, category, lat, lng, price_level, typical_duration_min, indoor)
      values ('Hacked', 'bar', 45.5, -73.5, 1, 60, true);
    failures := failures || text 'cannot insert places';
  exception when insufficient_privilege then null;
  end;

  -- ---------- act as the public anon key ----------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  select count(*) into n from public.places where id = place;
  if n <> 1 then failures := failures || text 'anon can read places'; end if;
  -- anon has no privileges on these tables: "permission denied" (or 0 rows) both mean blocked.
  begin
    select count(*) into n from public.busy_blocks;
    if n <> 0 then failures := failures || text 'anon cannot read busy_blocks'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from public.users;
    if n <> 0 then failures := failures || text 'anon cannot read users'; end if;
  exception when insufficient_privilege then null;
  end;

  -- ---------- act as the server (service role: bypasses RLS, needs table grants) ----------
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  select count(*) into n from public.busy_blocks;
  if n < 3 then failures := failures || text 'service_role can read all busy_blocks (grants missing? run 0002_grants.sql)'; end if;
  select count(*) into n from public.plan_members;
  if n < 2 then failures := failures || text 'service_role can read plan_members'; end if;

  -- ---------- report (always raises, so everything above rolls back) ----------
  if array_length(failures, 1) is null then
    raise exception 'RLS CHECK PASSED (19 checks). This error is intentional: it rolls back the test rows.';
  else
    raise exception 'RLS CHECK FAILED: %', array_to_string(failures, '; ');
  end if;
end;
$$;
