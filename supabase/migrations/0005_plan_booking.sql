-- 0005: N4 "Book it". The organizer marks a confirmed plan's reservation as requested.
-- Written by Anthony, applied by Adel. Paste into the Supabase SQL Editor and run. Safe to re-run.
-- Writes go through the server (admin client) like every other plan write, so no new RLS policy:
-- members already read their plans (0001), and this is just one more column on that row.
alter table public.plans
  add column if not exists booking_status text not null default 'none';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_booking_status_check') then
    alter table public.plans
      add constraint plans_booking_status_check check (booking_status in ('none', 'requested'));
  end if;
end
$$;
