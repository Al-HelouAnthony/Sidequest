# QA overnight log (Sidequest)

Branch `qa/overnight` from `main` = `f1b8723` (tag `qa-baseline`). `main` is never touched.
Real Supabase: read-only (backup at the start, row-count check at the end). All tests run on a **local Supabase copy** (Docker).
Times are Montréal time.

## 01:35 · Start
- Created `qa/overnight` + tag `qa-baseline`. `.gitignore`: `qa/backup/` (real personal data), `.playwright-mcp/`, `supabase/.temp/`.
- Starting Docker Desktop for a local Supabase.
- Adjustments to the QA prompt (see the plan): JavaScript (no typecheck step: lint + build + vitest); Ticketmaster / Google Places / `/api/photo` were never built → "not built" in the inventory; test logins use the existing `DEMO_MODE` + `/api/dev/login-as` (off on prod), no new auth flag.
- Next: read-only backup of the real DB → local Supabase → baseline.

## 01:55 · Safe sandbox ready
- **Read-only backup** of the real DB (`scripts/qa-backup.mjs`, only `select`): users 9 · friendships 30 · places 61 · busy_blocks 145 · travel_times 540 · interactions 118 · tag weights 75 · events 3,962 · plans 26 · plan_members 83 · plan_photos 1 · businesses 54,937. Saved to `qa/backup/` (gitignored). `google_tokens` / `plan_locations` NOT exported.
- **Local Supabase** in Docker (`npx supabase@2 start`, CLI v2.122; db/auth/rest/realtime/storage/kong only). Migrations 0001–0008 applied; `businesses` (54,937) + `events` tables from `supabase/import/`; migrations 0004/0006/0008 re-run after them (they skip missing tables). Backup loaded with `scripts/qa-load-local.mjs`: **every table matches the real row counts**.
- **Guard:** `scripts/qa-local.mjs → assertLocal()` refuses any host but 127.0.0.1/localhost (tested against the real host: refused).
- **`.env.local` now points at the local stack** (`DEMO_MODE=true`, `USE_MOCK_DATA=false`, Claude + ORS keys blank by default). The real file is backed up outside the repo; restored at 8:30. ⚠️ `NEXT_PUBLIC_SUPABASE_URL` is baked into client builds: after the restore, rebuild before any local `next start`.
- Baseline: lint ✅, build ✅ (14 s), 616/616 tests ✅ → `qa/BASELINE.md`.
- First findings so far: `/api/dev/login-as?next=//evil.com` is an open redirect (demo mode only, prod has DEMO_MODE=false) → P3, small fix planned (reuse `safeNextPath`). Place photos up to 760 KB each, 18 MB total, served raw → P2 recommendation.
- Next: feature inventory, qa-seed (25 edge-case users), feed invariant tests.
