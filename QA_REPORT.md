# QA report: Sidequest overnight run (Sun Nov 22, 01:35 → 02:25)

Branch **`qa/overnight`** (from `main` = `f1b8723`, tag `qa-baseline`). `main` was never touched.
Every test ran on a **local copy of our Supabase** (Docker). The real database was only **read** twice: the backup at 01:35 and a row-count check at 02:23, which matched exactly.

---

## 1. TL;DR

**Is the demo safe? Yes.** The full demo flow passed **3 times in a row** from a fresh state, on two phones (Sam + Maya):

| Step | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Feed: what + when + who + travel + reason | ✅ | ✅ | ✅ |
| "Why am I seeing this?" | ✅ | ✅ | ✅ |
| Skip 3 bars → Refresh → **0 bars in the top 10** | ✅ | ✅ | ✅ |
| Let's go → invite on Maya's phone, no refresh | 706 ms | 636 ms | 647 ms |
| Maya "I'm in" → "confirmed" on Sam's phone | 205 ms | 210 ms | 116 ms |
| Search "something cheap with Maya tomorrow night" | ✅ | ✅ | ✅ |

**Top 5 risks for the demo**
1. **Fast skipping could break "skip 3 bars → bars gone"**: found and fixed (`3327dd3`). Until that commit is merged, skip slowly on stage (about 1 second between skips).
2. **"Remove friend" never worked in production**: every removal said "isn't available yet". Fixed (`a5a2570`). Until it's merged, don't tap ✕ on a friend during the demo.
3. **The first feed page shows template captions, not Claude's.** Claude is slower than the 0.8 s budget, so the first page goes out with templates and later pages get Claude's. **Open the feed once before going on stage** to warm the cache.
4. **Slow phones load the feed slowly**: LCP is 3.8 s on a throttled phone (target 2.5 s) because each place photo is about 400 KB. Use good Wi-Fi on stage. A ready-made fix is in §4 (optional).
5. **Privacy question a judge might ask:** adding a friend is one-sided and needs no consent, and gives access to that person's free/busy times (§5). It's a product decision, not a quick fix.

**Should the team merge `qa/overnight`? Partially.** Merge these **5 fix commits** (cherry-pick, each is small, tested and independent):

| Commit | What | Risk |
|---|---|---|
| `3327dd3` | fix(interactions): concurrent swipes no longer lose learning (server queue + feed sends swipes in order) | low, demo-relevant |
| `a5a2570` | fix(data): add `removeFriendship` → "Remove friend" works | low |
| `a939185` | perf(plans): My plans / Memories load users and places once (29 → ~6 queries), byte-identical output | low |
| `904c541` | fix(a11y): label the hidden camera input | none (aria-label only) |
| `29fc00b` | fix(dev): `login-as` only redirects inside the app (demo mode only) | none |

The `test(qa)` / `chore(qa)` commits (QA scripts, tests, screenshots, reports, `supabase/config.toml`) are useful but **not needed for the demo**: merge them after the hackathon, or not at all.

```bash
git checkout main && git pull
git cherry-pick 3327dd3 a5a2570 a939185 904c541 29fc00b
npm run lint && npm run build && npx vitest run   # 622 tests
```

Owners to tell: **Mhammad** (`lib/social/plans-store.js`, `app/api/friends/[id]` now works), **Adel** (`lib/data/index.js` + `db.js`: new `removeFriendship`), **Oscar** (`app/feed/page.jsx`: swipes queued; `PlanPhotos.jsx`: aria-label).

---

## 2. Feature inventory: pass / fail
Full list: [`qa/FEATURE_INVENTORY.md`](qa/FEATURE_INVENTORY.md). Tests: `tests/qa/*.qa-test.js` (run with `npx vitest run -c vitest.qa.config.mjs` against the local stack) and `tests/e2e/*` (Playwright).

| Feature | Result | Evidence |
|---|---|---|
| Feed hard rules (free for everyone, open, travel ≤ 35 min, rain, events, waking hours, lead time, no duplicates, score = Σ weights) | ✅ **0 violations** in ≈ 1,300 cards, 39 users | `tests/qa/feed-invariants.qa-test.js` |
| Feed edge users (fully booked, zero friends, Laval, far suburb, 15-min gaps) | ✅ 200 + empty feed, never a 500 | same |
| Edge places/events (closed all week, 24 h, 20:00–03:00, past event, 3 AM event, no coordinates, no photo) | ✅ appear exactly when they should | §3 of QA_LOG |
| Staged rain (`FORCE_RAIN_DAY`) | ✅ 0 outdoor places in the rain window | `rain.qa-test.js` |
| Learning (skip / save / go, clamp) | ✅ after fix `3327dd3` | `interactions.qa-test.js` |
| Plans / invites / RSVP / cancel / booking | ✅ | `plans.qa-test.js` |
| Start now (ignores my calendar, needs a free friend) | ✅ | same |
| Memory photos / Memories / live location | ✅ private, members only, no coordinates leaked | same |
| Realtime (3 browsers) | ✅ invite 157 ms, RSVP 119 ms, reconnect 90 ms | `tests/e2e/realtime-3-users.template.js` |
| Search (word lists) incl. French, injection, 300 chars | ✅ valid response < 400 ms, bad input 400 | `search.qa-test.js` |
| Captions (Claude) + template fallback | ✅ (first page = templates, see risk 3) | `captions.qa-test.js` |
| Calendar sync (750 events, re-sync, expired token, empty) | ✅ | `calendar.qa-test.js` |
| Onboarding (4 steps) | ✅ 6.4 s click-through, saved | `tests/e2e/onboarding.template.js` |
| Profile / friends / user search | ✅ after fix `a5a2570` (Remove friend was ❌) | `profile-friends.qa-test.js` |
| Auth: real-accounts mode, RLS, secrets | ✅ (one privacy design finding, §5) | `auth.qa-test.js`, `rls.qa-test.js` |
| Feed keeps its place across tabs, double taps | ✅ | Playwright |

---

## 3. Bugs found

| # | Sev | Bug | Repro | Status |
|---|---|---|---|---|
| 1 | **P1** | Swipes sent at the same time overwrite each other's learning (4 skips kept 1: `cat:cafe` −0.25 instead of −1). The feed fires skips without waiting, so fast skipping can stop "bars gone" from happening. | 4 concurrent `POST /api/interactions` skips → read `user_tag_weights` | **Fixed `3327dd3`** + regression test (fails before / passes after) |
| 2 | **P1** | "Remove friend" always fails ("Removing friends isn't available yet"): `removeFriendship` was never merged into `lib/data`. | Friends tab → ✕ on a friend → Remove | **Fixed `a5a2570`** + tests; live: 200, idempotent |
| 3 | P2 | N+1 queries: `/api/plans` = 29 Supabase requests for 13 plans, `/api/memories` = 31 | Any user with many plans | **Fixed `a939185`**: ~6 / 9; responses byte-identical for all 39 users |
| 4 | P2 | Accessibility: the camera file input had no accessible name (axe serious) | `/plans/[id]` during a plan | **Fixed `904c541`** |
| 5 | P3 | `/api/dev/login-as?next=//evil.com` open redirect | demo mode only | **Fixed `29fc00b`** |
| 6 | P3 | API accepts plans **in the past**, **non-friend** invitees, and an invite list with **only yourself** (1-member plan) | `POST /api/plans` by hand (the UI never sends these) | open: recommendation |
| 7 | P3 | Everyone declines → plan auto-cancelled and final: nobody can change their mind (409) | 2 invitees both "Can't make it" | open: product decision |
| 8 | P3 | No body size limit on JSON APIs (2 MB body accepted, extra fields dropped) | `POST /api/interactions` with a huge body | open |
| 9 | P3 | Uploads are only checked by their first bytes: a corrupt "JPEG" shows as a broken tile in the album / Memories (real camera uploads are always valid) | upload 12 bytes starting with FF D8 FF | open: verify decode or add an `onError` fallback |
| 10 | P3 | With a bad Claude key, every feed page retries Claude (no back-off) | invalid `ANTHROPIC_API_KEY` | open |
| 11 | P3 | Search: "demain" not understood; names with an apostrophe only match after it ("brien" yes, "o'brien" no); API accepts 0 interests (UI requires 5) | `/api/search`, `/api/users?q=` | open |

---

## 4. Performance (local stack: real numbers on Vercel are higher by the network round trips)

| Endpoint | Cold | Warm p50 | p95 | 10 concurrent p95 | Supabase requests |
|---|---|---|---|---|---|
| `GET /api/feed` (page 1) | 513 ms | 244 ms | – | 2.3 s | 11 |
| `GET /api/feed` (page 2) | 233 ms | 235 ms | – | 2.6 s | 7 |
| `POST /api/search` | 62 ms | 36 ms | – | 310 ms | 9 |
| `GET /api/plans` | 48 ms | 33 ms | – | 323 ms | **29 → ~6** |
| `GET /api/memories` | 59 ms | 41 ms | – | 341 ms | **31 → 9** |
| every other route | < 60 ms | < 25 ms | – | < 170 ms | 2–5 |

Full numbers: `qa/results/perf-before.json`.
- **Feed time** is the engine itself (≈ 210 ms of CPU per page; data load 14 ms warm). Within the targets (warm < 800 ms, cold < 2 s). Not optimized tonight: caching pages would risk the "skip → refresh → bars gone" demo moment.
- **Database:** `EXPLAIN ANALYZE` on the heavy queries is < 3 ms each with the existing indexes. **No index or migration added.**
- **Frontend** (Playwright, iPhone size): fast machine LCP 0.75 s, CLS 0, smooth. Throttled phone (4× CPU, 9 Mbps, 150 ms): **LCP 3.8 s**, CLS 0, 53/450 frames > 34 ms while snapping. About **7.5–8 MB of photos** for the first 20 cards.
  - **Optional fix, not applied:** `node scripts/optimize-place-photos.mjs` re-encodes the 60 place photos at the same size (mozjpeg q80) into `qa/optimized-photos/`, **−49 % (17.6 → 9.0 MB)**. Compare a few, then copy over `public/places/` if they look the same (Adel's call).
- **JS:** 22 chunks, 1,285 KB raw / 381 KB gzip in total.

## 5. Security
- ✅ **RLS** with real user tokens:
  - strangers' busy blocks / swipes / weights / travel / profile / friendships → 0 rows;
  - `google_tokens`, `plan_locations`, `plan_photos` refused;
  - direct plan / member inserts refused;
  - anonymous users get nothing private (places are public by design);
  - the private photo bucket can't be listed and refuses direct uploads.
- ✅ **Production mode** (`DEMO_MODE=false`):
  - all 16 API routes → 401 without a session, 7 pages → `/login?next=`;
  - the demo cookie is ignored, and `login-as` / seed are hidden;
  - a junk session cookie → 401;
  - a session whose users row was deleted gets signed out.
- ✅ **Input:** malformed JSON, wrong types, bad enums and unknown ids → clean 4xx JSON, no stack traces. Identity always comes from the session (a forged `userId` in the body is ignored).
- ✅ **No secrets in the client bundle**: 38 files checked against all 8 real/local secret values plus key patterns.
- ⚠️ **P2, design:** friendships are **one-sided and need no consent**. Any signed-in user can add anyone (with the app's "Add friend", or directly with Supabase's API using their own token) and then see that person's free/busy times and approximate home area (postal-code centroid). Fix after the hackathon: friend requests plus RLS that needs an accepted friendship.
- ℹ️ Realtime Broadcast channels are public but carry **no data** (just "plan changed"); clients refetch through the authenticated API.

## 6. Visual / UX
Screenshots: `qa/screenshots/{390x844,360x740,1440x900}/*.jpg`, covering 33 screens/states per viewport.
- ✅ **No horizontal overflow**, no crash, **no broken images from real data** at any viewport. Long and accented names wrap correctly. Missing or broken avatars fall back to initials. A place without a photo shows a clean dark card.

**Polish (P3, report only, nothing changed):**

| Screen | Issue | Screenshot |
|---|---|---|
| Feed, 360 px | The swipe knob covers the "S" of "Swipe to go" | `360x740/feed*.jpg` |
| Feed, long search | The summary pushes "Clear" off-screen. The row scrolls sideways, but nothing shows that it does | `*/feed-search-long-summary.jpg` |
| Feed card | "Details" / "Weather" chips are 32 px tall (< 44 px tap target) | – |
| Login | The demo user switch links are 32 px tall | – |
| Feed, zero friends | Says "Everyone's busy". "Add friends to get ideas" would help | `*/feed-empty-zero-friends.jpg` |
| Feed, Laval / far suburb | Says "Everyone's busy" when the real reason is distance | – |
| Plan screen | "On the way" shows only the first name word, so "qa_No Interests" becomes "qa_No". Fine for real names | `*/plan-live-photos-location.jpg` |

- **axe** (serious): one orange accent text and one red "late" text below contrast; the Why sheet's scroll area isn't keyboard-focusable.
- **Console:** `navigator.vibrate` is called before the first tap (Chrome blocks it; harmless noise).

## 7. Planned but not built
Ticketmaster, Google Places, `/api/photo` (dropped by the team), NL search with Claude (plain word lists instead), map view, group mode, `.ics` download (Google Calendar insert covers it), push notifications, friend requests/acceptance.

## 8. Live external API calls tonight
Claude ≈ 3 (caption check) + 6 failed calls with a deliberately invalid key · OpenRouteService ≈ 6 (postal-code checks) · Open-Meteo ≈ 10 (cached 30 min) · Google Places / Ticketmaster / Google Calendar: **0**. No emails, SMS or pushes; no real calendar touched.

## 9. What changed outside the code
- **Real database:** nothing (read-only backup + read-only count check, identical).
- **Local only:** a Supabase stack in Docker (`npx supabase@2 start`, now **stopped**, data kept), `supabase/config.toml` + `supabase/.gitignore` on the QA branch.
- **No test-only auth flag added:** tests use real local Supabase sessions (`scripts/qa-session.mjs`) and the existing demo cookie.
- `.env.local` was pointed at the local stack during the run and **restored byte-for-byte**; the local build was redone with the real env.
- `qa/backup/` (real data: names, home areas) is **gitignored**. Delete it after the hackathon.

## 10. Don't touch before the demo
- `lib/engine/*` (ranking, variety, learning): correct on 1,300 cards; any tweak changes the demo.
- `lib/engine/config.js` → `LEARNING.suppressAt` / `beta` (the "bars gone" moment depends on them).
- `app/feed/page.jsx` scroll/restore logic and `components/feed/usePager.js`.
- `lib/social/realtime.js` / `live.js` (invites in < 1 s).
- `.env` on Vercel (`DEMO_MODE=false`, `FORCE_RAIN_DAY` empty).
- **Before going on stage:** open the feed once (warm captions). Use the reset if needed: `POST /api/dev/seed` resets the WHOLE demo world. Skip at a calm pace unless `3327dd3` is merged.

## How to re-run this QA
```bash
npx supabase@2 start                     # local stack (Docker)
node scripts/qa-load-local.mjs <supabase-status.env>   # load qa/backup into it
node scripts/qa-seed.mjs                 # 30 edge-case users etc.
# point .env.local at the local stack, then:
npm run build && npx next start -p 3100
npx vitest run -c vitest.qa.config.mjs   # + QA_RAIN=tue / QA_REAL_MODE=1 / QA_CLAUDE=… for the gated ones
node scripts/qa-cleanup.mjs              # back to the backup state
```
