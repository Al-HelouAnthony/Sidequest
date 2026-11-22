# QA overnight log (Sidequest)

Branch `qa/overnight` from `main` = `f1b8723` (tag `qa-baseline`). `main` is never touched.
Real Supabase: read-only (backup at the start, row-count check at the end). All tests run on a **local Supabase copy** (Docker).
Times are Montréal time.

## 01:35 · Start
- Created `qa/overnight` + tag `qa-baseline`. `.gitignore`: `qa/backup/` (real personal data), `.playwright-mcp/`, `supabase/.temp/`.
- Starting Docker Desktop for a local Supabase.
- Adjustments to the QA prompt (see the plan): JavaScript (no typecheck step: lint + build + vitest); Ticketmaster / Google Places / `/api/photo` were never built → "not built" in the inventory; test logins use the existing `DEMO_MODE` + `/api/dev/login-as` (off on prod), no new auth flag.
- Next: read-only backup of the real DB → local Supabase → baseline.

## 01:40 · Safe sandbox ready
- **Read-only backup** of the real DB (`scripts/qa-backup.mjs`, only `select`): users 9 · friendships 30 · places 61 · busy_blocks 145 · travel_times 540 · interactions 118 · tag weights 75 · events 3,962 · plans 26 · plan_members 83 · plan_photos 1 · businesses 54,937. Saved to `qa/backup/` (gitignored). `google_tokens` / `plan_locations` NOT exported.
- **Local Supabase** in Docker (`npx supabase@2 start`, CLI v2.122; db/auth/rest/realtime/storage/kong only). Migrations 0001–0008 applied; `businesses` (54,937) + `events` tables from `supabase/import/`; migrations 0004/0006/0008 re-run after them (they skip missing tables). Backup loaded with `scripts/qa-load-local.mjs`: **every table matches the real row counts**.
- **Guard:** `scripts/qa-local.mjs → assertLocal()` refuses any host but 127.0.0.1/localhost (tested against the real host: refused).
- **`.env.local` now points at the local stack** (`DEMO_MODE=true`, `USE_MOCK_DATA=false`, Claude + ORS keys blank by default). The real file is backed up outside the repo; restored at 8:30. ⚠️ `NEXT_PUBLIC_SUPABASE_URL` is baked into client builds: after the restore, rebuild before any local `next start`.
- Baseline: lint ✅, build ✅ (14 s), 616/616 tests ✅ → `qa/BASELINE.md`.
- First findings so far: `/api/dev/login-as?next=//evil.com` is an open redirect (demo mode only, prod has DEMO_MODE=false) → P3, small fix planned (reuse `safeNextPath`). Place photos up to 760 KB each, 18 MB total, served raw → P2 recommendation.
- Next: feature inventory, qa-seed (25 edge-case users), feed invariant tests.

## 01:47 · Test data + feed correctness
- `scripts/qa-seed.mjs` (idempotent, local only): 30 edge-case users (`qa_` names, ids `0a0a…`): accents/apostrophe/emoji/66-char name, no/broken avatar, MWF classes, night owl, weekends only, fully booked (all-day), back-to-back 45 min with 15-min gaps, blocks crossing midnight, duplicate + overlapping blocks, Laval, far suburb (Saint-Jérôme), no interests, every interest; friend graph with 3 clusters, a bridge user, friends-of-friends, a hub with 22 friends, a zero-friend user. 7 edge-case places (no photo, closed all week, open 24 h, 20:00–03:00 bar, outdoor-only, two with the same name) and 5 events (past, inside a free slot, at 3 AM, no image, no coordinates). Local logins for the 4 teammates (local auth copies). Schema already forbids "missing home", "missing price" and zero-length busy blocks (NOT NULL / CHECK) → not seedable, noted.
- Sign-in for tests = real local Supabase sessions (`scripts/qa-session.mjs`, password on the LOCAL auth server), no app change and no new auth flag.
- **Feed hard rules (`tests/qa/feed-invariants.qa-test.js`), 39 users × 4 pages ≈ 1,300 cards: 0 violations.** Checked against the DB directly: me + every friend free, friends are real friends, never me, open for the whole visit, long enough, travel ≤ 35 min and equal to the DB, no outdoor in rain, events in the future with their start inside the slot, waking hours, lead time, horizon, no duplicate ids, no duplicate places in pass 1, score = Σ weight × component, alternatives obey the same rules. No category 3 in a row anywhere.
- Edge users all return 200 + empty feed (fully booked, zero friends, Laval, far suburb, back-to-back). Closed-all-week place, past event, 3 AM event, no-coordinates event never appear. 24 h diner and 20:00–03:00 bar appear at the right times.
- UX note (P3): Laval / far-suburb users get "Everyone's busy" when the real reason is distance.
- Next: staged rain, learning, plans/RSVP/realtime, search, security.

## 01:50 · First real bug fixed (P1, demo risk)
- **Lost learning updates.** `/api/interactions` does read weights → change → write. 4 concurrent skips kept **1** (`cat:cafe` −0.25 instead of −1). The feed fires skips without waiting, so fast skipping in the demo ("skip 3 bars → refresh → bars gone") could leave `cat:bar` above the suppression threshold.
  Fix `3327dd3`: the server applies one user's swipes one at a time; the feed sends them in order. Same requests, same results, nothing visible. Regression test fails before (−0.25) and passes after (−1). Live re-check: −1.
- Staged rain (`FORCE_RAIN_DAY=tue`): 0 outdoor places in Tue 13–18, 166 indoor ideas there, 175 outdoor elsewhere ✅.
- Learning: skip 3 bars → 0 bars in the top 10 ✅ (`cat:bar` −0.75). Save/go raise, clamp at −1 ✅ (place tags get the step split across tags, by design).
- Validation: malformed JSON / missing fields / bad uuid / bad date / bad enum → 400, unknown place → 404, no stack traces ✅. Forged `userId` in the body is ignored ✅.
- Finding (P3, report only): API bodies have no size limit (a 2 MB JSON body is read and accepted; unknown fields are dropped by Zod).
- Next: plans / RSVP / realtime / now / memories / photos / location / booking, then search, security (RLS with JWTs).

## 01:55 · Plans, realtime, search, security
- **Plans / invites / RSVP** (`tests/qa/plans.qa-test.js`): create → invitees see it, outsiders 403, RSVP in → confirmed, in → out → pending, everyone declines → **auto-cancelled and final** (changing your mind → 409; UX note), invalid RSVP 400, booking read by members / marked by organizer only, cancel organizer-only and idempotent, RSVP after cancel 409, unknown plan 404, busy invitee 409 with a friendly message, duplicate invitees deduped, bad bodies 4xx.
  Report-only findings: the API accepts **non-friend invitees**, **plans in the past**, and an invite list with **only yourself** (1-member plan). The UI never sends these.
- **Start now**: fully-booked user with free friends → 201 (own calendar ignored, as requested); zero friends → 409 "Nobody's free…".
- **Photos / memories / location**: member upload 201, outsider 403, SVG/HTML disguised as a photo 415, wrong field 400, signed URL works, the public bucket path without a token is refused, memories only list my plans; location: posted by a member, others get status/ETA **without coordinates**, 2nd post within 15 s → 429, outsider 403, invalid lat 400.
- **Realtime, 3 browsers (Playwright)**: invite banner on both invited phones **157 ms** after the plan is created (no refresh); "I'm in" → "confirmed" on the 2 other screens in **119 ms**; phone offline during a change → caught up **90 ms** after reconnecting. No duplicate banners.
- **Search** (14 queries incl. French, prompt injection, SQL, `<script>`, emoji, 300 chars): all 200 with a valid schema in < 400 ms; empty / 2,000 chars / wrong type → 400. UX notes: "demain" isn't understood (café is); a 300-char query is echoed whole in the summary; a zero-friend user searching "with Maya" sees "No coffee nearby".
- **Security**
  - RLS with real tokens: strangers' busy blocks / interactions / weights / travel / profile / friendships → 0 rows; google_tokens / plan_locations / plan_photos refused; direct plan / member inserts refused; anonymous gets nothing private (places are public by design); private photo bucket not listable, no direct uploads.
  - **Finding (P2, report only):** friendships are one-sided and need no consent: any signed-in user can add anyone as a friend (directly in the DB, or via the app's own Add friend) and then read their busy times and approximate home area (postal-code centroid). Needs a product decision (friend requests).
  - Client bundle: 0 secrets (all 8 real/local secret values + key patterns checked in 38 files).
  - Real-accounts mode (`DEMO_MODE=false`): 16 APIs → 401 JSON without a session, 7 pages → `/login?next=`, demo cookie ignored, dev routes hidden, junk session cookie → 401, session without a users row → signed out.
  - **Fixed `29fc00b`** (P3, demo mode only): `/api/dev/login-as?next=//evil.com` open redirect → now uses `safeNextPath` like the sign-in callback. Test fails before / passes after.
- Next: performance (queries per request, p50/p95, LCP/CLS, images), then visual/UX at 3 viewports.

## 02:08 · Performance + visual review
- **Perf (local, `scripts/qa-perf.mjs`)**: feed cold 513 ms / warm p50 244 ms (engine CPU ≈ 210 ms of it; data load 14 ms warm) — within targets (warm < 800, cold < 2 s). 10 concurrent feed requests → p95 2.3 s (single Node process, CPU-bound; Vercel scales per request). Every other route p50 < 45 ms.
- **N+1 fixed `a939185` (P2)**: `/api/plans` did 29 Supabase requests for 13 plans, `/api/memories` 31 → now ~6 and 9. Responses byte-identical for all 39 users (snapshot diff 78/78). Regression test fails before (3 user lookups) / passes after (1).
- **DB**: `EXPLAIN ANALYZE` on busy blocks, travel times, events of the week, registry name search, plan members → all < 3 ms with the existing indexes. **No index added, no migration.**
- **Frontend (Playwright, mobile emulation)**: fast machine LCP 0.75 s, CLS 0, no long tasks, smooth scrolling. Throttled phone (4× CPU, 9 Mbps, 150 ms): LCP **3.8 s** (target 2.5), CLS 0, 53/450 frames > 34 ms while snapping. Cause: ~7.5–8 MB of photos for the first 20 cards (≈ 400 KB each; next page preloaded). Re-encoding the 60 place photos at the same size (mozjpeg q80) would make them **49 % smaller** (17.6 → 9.0 MB): recommendation only (changes pixels, Adel's assets).
- **Visual sweep**: 33 screens/states × 3 viewports (390×844, 360×740, 1440×900), screenshots in `qa/screenshots/` (JPEG). **No horizontal overflow, no crash, no broken images from real data** anywhere. Findings: long search summary pushes "Clear" off-screen (row scrolls sideways, by design → P3); swipe knob covers the "S" of "Swipe to go" at 360 px (P3); "Details"/"Weather" chips are 32 px tall (< 44, P3); axe: 1 orange-text contrast, 1 red-text contrast, Why sheet scroll region not focusable (P3, design); zero-friends user sees "Everyone's busy" (UX); `navigator.vibrate` called before the first tap (console noise).
- **Fixed `904c541`**: camera file input on the plan screen had no accessible name (axe "label", serious) → `aria-label`, nothing visible changes.
- Broken tiles in Memories during the sweep were my own 12-byte fake JPEGs from API tests (the server only checks the first bytes; real uploads are canvas-encoded) → recommendation: verify decode or add an `onError` fallback.
- Next: captions/Claude fallback, calendar sync, onboarding/friends/me APIs, then the demo flow ×3.
