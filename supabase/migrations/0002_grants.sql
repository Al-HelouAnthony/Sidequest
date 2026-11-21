-- =============================================================================
-- 0002_grants.sql: table privileges for the Supabase API roles. Owner: Adel.
--
-- WHY: 0001 created the tables and the RLS policies, but newer Supabase projects do
-- NOT auto-grant privileges on new public tables to anon / authenticated / service_role.
-- Without grants every request fails with 42501 "permission denied for table ...",
-- even for the service role. RLS policies only filter rows once the role is allowed
-- to touch the table at all; privileges are the first gate, RLS is the second.
--
-- Least privilege: grant only what the RLS policies in 0001 can actually allow.
-- Apply AFTER 0001 (SQL Editor → paste → Run). Safe to run more than once.
-- =============================================================================

-- service_role: the Next.js server (lib/supabase/admin.js). Bypasses RLS, needs full access.
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;

-- anon: the public key. Only the places catalogue is readable.
grant select on public.places to anon;

-- authenticated: signed-in users. Reads on every table (rows filtered by RLS) ...
grant select on
  public.users, public.friendships, public.busy_blocks, public.places, public.travel_times,
  public.interactions, public.user_tag_weights, public.plans, public.plan_members
to authenticated;

-- ... and writes only where 0001 defines write policies.
grant insert, update on public.users            to authenticated;  -- first login + edit own profile
grant insert, update, delete on public.friendships      to authenticated;
grant insert, update, delete on public.busy_blocks      to authenticated;
grant insert on public.interactions                     to authenticated;
grant insert, update, delete on public.user_tag_weights to authenticated;
-- places, travel_times, plans, plan_members: no authenticated writes (service role only).
