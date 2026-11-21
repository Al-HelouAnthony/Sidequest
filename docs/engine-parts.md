# Anthony: engine section, split into parts (with team sync points)

## Context
Anthony owns PLAN.md §6.1: the feed engine (A1–A7, A9) **plus** Google login + Calendar sync in the social phase (A8 → §6.5 S4/S5). Today `/api/feed` and `/api/interactions` are stubs (`app/api/feed/route.js` returns `lib/mocks/feedCards.js`). The goal is to split the whole section into **small parts with one job each**: one file (or two), one clear input/output, its own tests, and its own "best version" bar. Each part = one focused Claude session = one small PR. Parts can be polished independently without breaking the others.

Rules for every part (from the agent-quest-planner skill, adapted): hard constraints are never violated; never invent hours or travel times (missing weekday = closed; estimates keep `isEstimate`); Claude never decides the ranking; the engine is pure, and `now` is injected, never read inside `lib/engine/`.

Core design: a **30-min time grid** over 7 days × 09:00–23:00 (196 ticks). Each user gets a free/busy flag per tick, and each place an open/closed flag per tick. A candidate = (place, start tick, enough ticks for the visit). This replaces fiddly interval math and makes every gate a simple per-tick check.


## The parts

Status legend: **[skeleton]** = needed for the Fri 11 PM checkpoint · **[harden]** = tests/quality · **[later]** = Sat.

### Part 0: Foundations [skeleton] · ~30 min
- **Job:** everything the other parts share.
- **Files:** `lib/engine/config.js` (add `tickMin: 30`, `minLeadMin: 60`, `minFriends: 1`, `LEARNING.suppressAt: -0.5`, `suppressFactor: 0.3`, `noveltyDays: 14`); **no `timing.js`**: Mhammad writes it himself, so `scoring.js` uses a constant `timing = 0.5` until his file is merged (Part 7c then imports it); `lib/engine/context.js` (`indexContext(raw)`: the one pure function that shapes the EngineContext, used by both `load.js` and the fixtures); `lib/engine/fixtures.js` (`makeCtx({ now, ... })` test builder with a fixed `now`, e.g. Fri 2026-11-20 20:00 local, built from `lib/mocks/*`).
- **Best version:** every later test starts from one line, `makeCtx()`.
- **Done when:** committed + pushed to `backend_a`; PR to `main` merged.

### Part 1: Context loader [skeleton] · ~30 min
- **Job:** the only I/O in the engine. Fetches everything in parallel and indexes it.
- **File:** `lib/engine/load.js`: `loadContext(userId, now)` uses `Promise.all` over `getUser`, `getFriends`, `getPlaces`, `getBusyBlocks`, `getWeather`, `getTravelTimes`, `getTagWeights` and `getRecentInteractions` (all in `lib/data/index.js`), then builds Maps: `travel` keyed `${userId}:${placeId}`, `weatherByHour` keyed by hour ISO, `busyByUser`.
- **Best version:** one round trip; works the same once Adel flips `USE_MOCK_DATA=false`.
- **Done when:** a test shows the ctx has all keys for the demo user.

### Part 2: Time grid [skeleton] · ~45 min
- **Job:** turn `now` + config into ticks.
- **File:** `lib/engine/slots.js`: `buildTicks(now, cfg)` returns `[{ i, startMs, endMs, startIso, weekday, minuteOfDay, hourKey }]`. Uses `atLocalTime`, `weekdayKey` and `toIsoUtc` from `lib/time.js`. Starts at `now + minLeadMin`, rounded up to the next tick, and only within 09:00–23:00 local each day.
- **Best version:** correct local times on every day; no tick before the lead time.
- **Tests:** 196 ticks from a morning `now`; fewer on day 0 from an evening `now`; first tick ≥ now + 60 min.

### Part 3: Free-time masks [skeleton → harden] · ~45 min
- **Job:** busy blocks → a boolean array per user (free = no block overlaps the tick).
- **File:** `lib/engine/slots.js`: `freeMask(blocks, ticks)`, `allTrue(mask, i, n)`.
- **Best version:** conservative (a block 12:15–13:00 makes the 12:00 tick busy) and O(blocks + ticks) by sorting.
- **Tests:** overlapping blocks, back-to-back blocks, 12:15 edge, block outside waking hours, no blocks.

### Part 4: Opening-hours mask [skeleton → harden] · ~30 min
- **Job:** place `hours` → open flag per tick.
- **File:** `lib/engine/candidates.js`: `openMask(place, ticks)`. Open if some interval that weekday has `open ≤ m` and (`close > open` ? `m+30 ≤ close` : true). After-midnight closes don't matter because ticks end at 23:00, so document that in a comment.
- **Tests:** museum (closed Mon) never open Monday; Bily Kun (15:00–03:00) open at 22:30; missing weekday = closed.

### Part 5: Gates: travel + weather [skeleton → harden] · ~45 min
- **Job:** the hard constraints besides time.
- **File:** `lib/engine/candidates.js`:
  - `reachable(ctx, place)` returns `{ myMin, friendIds within cap }`; the place is dropped if I'm over `maxTravelMin`.
  - `rainBlocked(place, ticks, ctx)`: outdoor + any hour in the window over `rainCutoff` → blocked.
- **Best version:** an estimate (`isEstimate`) is used but flagged, never treated as verified.
- **Tests:** park blocked in the staged rainy Sat 13–18; indoor never blocked; over-cap friend excluded but the place kept.

### Part 6: Candidate generation [skeleton] · ~45 min
- **Job:** combine parts 3–5 into visit windows, cheapest checks first.
- **File:** `lib/engine/candidates.js`: `generateCandidates(ctx, ticks, filters)` returns `{ candidates: [{ place, startTick, nTicks, friendIds, myMin }], dropped: { filters, travel, closed, rain, busy, noFriends } }`.
- **Order:** filters (category / price / indoorOnly) → reachability → per tick: open → my free → rain → friends free for all ticks (≥ `minFriends`) → `filters.friendIds` all included. Window length = `ceil(max(60, typicalDurationMin) / 30)` ticks.
- **Best version:** < 50 ms for 100 places; drop counts add up.

### Part 7a: Score: interest [harden] · ~30 min
- **File:** `lib/engine/scoring.js`: `interestScore(place, user, weights)`: `raw = mean(tag weight + 0.5 if in user.interests) + w["cat:"+category]`, then `1/(1+e^(−3·raw))`.
- **Tests:** neutral ≈ 0.5; matching interests > 0.5; skipped category < 0.2.

### Part 7b: Score: social (friends, fairness, proximity) [harden] · ~30 min
- **File:** `scoring.js`: `friendsScore = min(1, Σ closeness / 6)`; `fairnessScore = 1 − maxTravel(group incl. me) / maxTravelMin`; `proximityScore = 1 − myMin / maxTravelMin`.
- **Tests:** more and closer friends score higher; one far friend lowers fairness.

### Part 7c: Score: context (weather, novelty, timing) [harden] · ~30 min
- **File:** `scoring.js`: `weatherScore` (indoor 0.8, or 1.0 when it's raining; outdoor `(1 − rain/100) × clamp((tempC + 5)/25)`, averaged over the window's hours); `noveltyScore` (none in 14 days → 1, save 0.6, skip 0.2, go 0.1; latest action wins); timing from `timingScore()` (Mhammad).
- **Tests:** sunny outdoor > cloudy outdoor; a recently skipped place scores low.

### Part 7d: Score assembly [skeleton] · ~20 min
- **File:** `scoring.js`: `scoreCandidate(c, ctx)` returns `{ score, breakdown }`, weighted by `SCORE_WEIGHTS`, then × `suppressFactor` if `w["cat:"+category] ≤ suppressAt`.
- **Skeleton version:** constant 0.5 for any component not built yet, so the checkpoint isn't blocked.
- **Tests:** total = Σ weight × component; breakdown parses as `ScoreBreakdown`.

### Part 8: Best window + diversify [skeleton → harden] · ~40 min
- **File:** `lib/engine/diversify.js`: `bestPerPlace(scored)` keeps the top window per place; `diversify(list, cfg)` is a greedy re-rank (adjusted = score − `diversityPenalty` × same-category count in the last `diversityWindow` picks).
- **Tests:** no place twice; no 3 bars in a row on mocks.

### Part 9: `buildFeed` + `/api/feed` [skeleton] · ~45 min
- **Files:** `lib/engine/index.js`: `buildFeed(ctx, { filters, debug })` returns `{ cards, debug? }`. A card has id `${placeId}:${slot.start}`, slot = window start/end ISO, friends with `travelMin` + `travelIsEstimate`, the window's weather, and caption = `templateCaption` (`lib/ai/templates.js`). Then `app/api/feed/route.js`: keep the existing filters parsing + `jsonError`, replace the mock with `loadContext` → `buildFeed` → slice by cursor (`ENGINE.pageSize`).
- **Best version:** < 500 ms; `?debug=1` adds `debug: { windows, dropped, ms }`. Unknown keys are stripped by the client's Zod parse, so this is non-breaking.
- **Done when:** **Fri 11 PM checkpoint:** real ranked cards from mocks on the live URL.

### Part 10: Swipe learning [later, Sat AM] · ~45 min
- **Files:** `lib/engine/learning.js`: `applyInteraction(weights, place, action)` is pure. It adds ±alpha/beta to each tag **and `cat:<category>`**, clamped to [min, max]. Then `app/api/interactions/route.js`: after `recordInteraction` → `getPlace` → `getTagWeights` → `applyInteraction` → `setTagWeights`.
- **Best version:** 2 skips of a bar → `cat:bar = −0.5` → suppressed, so no bars in the top 10. Obvious on stage.
- **Tests:** clamping; skip ×2 leaves no bars in the top 10 (full `buildFeed` on fixtures).

### Part 11: Integration hooks [later, Sat late AM–1 PM] · ~1 h total, in 3 bits
- **11a Filters for search:** confirm `buildFeed` honors every `FeedFilters` field (from `types/feed.js`); give Mhammad the call `buildFeed(ctx, { filters })`.
- **11b Real data switch:** when Adel flips `USE_MOCK_DATA=false`, re-run the tests + `?debug=1` and fix shape mismatches.
- **11c Captions:** once Mhammad merges `captionCards(cards)`, call it on the page slice only, with a fallback to the template.

### Part 12: Demo tuning + performance [later, Sat PM / polish] · ~45 min
- **Job:** the demo user's top 3 are great (sunny viewpoint/park with 2 friends, a café, a cheap dinner). Tune only `lib/engine/config.js`. Check `debug.ms`. Write a short "how the engine works" note for Adel's Devpost.

### Part 13: Google login (social, with Mhammad; PLAN.md S4) [Sat 2 PM+] · ~1.5 h
- Supabase Google provider using your Google Cloud OAuth client (redirect URLs for localhost + Vercel; test users added). `app/(auth)/login/page.jsx`, `app/auth/callback/route.js` (exchange code), session refresh in `proxy.js` (read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` first). `lib/auth.js`: Supabase user first, demo cookie as fallback when `DEMO_MODE=true`. Insert a `users` row on first login. Agree with Mhammad who writes which file before starting.

### Part 14: Calendar sync (social; PLAN.md S5) [Sat 2 PM+] · ~1.5 h · cut first if it fights back
- Request the Calendar read-only scope at sign-in (verify the scope string in Google's docs). Inside the callback (the only moment `provider_token` exists), call Google Calendar `freeBusy` for the next 7 days, then write `busy_blocks` with `source='google'`. `lib/calendar/google.js`, `app/api/calendar/sync/route.js`.

---

## Team sync protocol (check, approve, commit and notify)

Three kinds of sync point. Claude will **stop and tell Anthony** at each one during the session for that part:
- **CHECK**: confirm a fact with a teammate before or while building (their answer can change the code).
- **APPROVE**: a decision that affects someone else; get a 👍 in the team chat before merging.
- **COMMIT + NOTIFY**: you produced something a teammate depends on. Commit, push, open/merge the PR, then post the message below so they can pull and adapt.

**Message template** (post in the team chat):
> `[engine] <what> is on main (PR #n). @<who>: <what to change on your side>. Contract: <file / signature>. Questions → reply here.`

### Per-part sync points
| Part | CHECK (before / while) | APPROVE (before merge) | COMMIT + NOTIFY (after merge) |
|---|---|---|---|
| 0 Foundations | — (timing is Mhammad's; nothing to ask) | — | **Adel:** "engine tests now use `lib/mocks/*`. Changing mocks may break `npm test`, so run it." **Mhammad:** "until your `lib/engine/timing.js` lands, scoring uses timing = 0.5. Keep the signature `timingScore(category, startIso, endIso) → 0..1` and ping me when it's merged." |
| 1 Loader | **Adel:** are the 8 `lib/data` function names/arguments final? Will `getBusyBlocks` return *friends'* blocks once RLS is on? Will `getTravelTimes` cover every (user, place) pair? | — | **Adel:** "the engine depends on these 8 functions (list). Don't rename them; only change the bodies." |
| 2 Time grid | — | **Team:** waking hours 09:00–23:00 and a 60-min lead time (no suggestions starting within the next hour). | — |
| 3 Free masks | **Adel:** seeded busy blocks are UTC ISO and end-exclusive? | — | — |
| 4 Opening hours | **Adel:** `places.json` follows the rule "missing weekday = closed; close < open = closes after midnight"? | — | **Adel:** "hours rule enforced in `openMask`; places with a wrong format will just never show." |
| 5 Gates | **Adel:** once real ORS data lands, how many places are within 35 min for each user? (If too few, raise `maxTravelMin`.) | **Team:** travel cap 35 min, rain cutoff 60 %. | — |
| 6 Candidates | — | **Team:** never suggest something with 0 friends free (`minFriends: 1`). | — |
| 7a–7c Scores | **Mhammad:** has the real `timingScore` landed? Pull it. | **Team (5 min look):** the `SCORE_WEIGHTS` and novelty values. | — |
| 7d / 8 / 9 Feed live | **Oscar:** does he need any field that `FeedCard` doesn't have (e.g. an empty-feed reason)? If yes, that's a contract change → APPROVE row below. | **Contract changes only:** any edit to `types/*` needs 👍 from **Oscar + Mhammad + Adel** *before* merging. | **Oscar:** "real `/api/feed` is live, same `FeedCard` shape. Cards can be empty; dedupe by `card.id` across pages; `?debug=1` shows drop counts." **Mhammad:** "`buildFeed(ctx, { filters })` exists; here's how to call it from `/api/search`." |
| 10 Learning | **Oscar:** after a skip, should the feed refetch immediately or on the next page / pull-to-refresh? Agree on the demo flow ("skip 2 bars → refresh"). | **Team:** 2 skips suppress a category. | **Oscar:** "interactions now change the ranking. POST every skip/save/go." **Mhammad** (pitch): "learning demo works like this: …" |
| 11a Search filters | **Mhammad:** which `FeedFilters` fields does his parser actually produce? | — | **Mhammad:** "all `FeedFilters` fields are honored, tested in `index.test.js`." |
| 11b Real data | **Adel:** pair with him when he flips `USE_MOCK_DATA=false` (15 min, same screen). | — | **Everyone:** "engine runs on real data; set `USE_MOCK_DATA=false` in your `.env.local`." |
| 11c Captions | **Mhammad:** has `captionCards` merged? What's its latency (target < 2.5 s total feed)? | — | **Mhammad + Oscar:** "Claude captions are wired into `/api/feed`; the template fallback still works." |
| 12 Tuning | **Team rehearsal:** are the top 3 cards good? | **Team:** final `config.js` values before the 1 AM freeze. | **Adel:** "engine explainer for Devpost is in `docs/engine.md`." |
| 13 Google login | **Mhammad:** split the files *before* starting (who writes `lib/auth.js`, `proxy.js`, the callback). **Adel:** RLS policy that lets the first login insert its own `users` row; Supabase dashboard access to enable the Google provider. | **Mhammad:** the `lib/auth.js` change (everyone's routes depend on it). | **Everyone:** "Google login is on main. `getSessionUserId()` is unchanged and DEMO_MODE login-as still works. Pull before your next PR." Send `GOOGLE_CLIENT_ID`/`SECRET` **privately**. |
| 14 Calendar | **Adel:** `busy_blocks` allows inserts with `source='google'`. | — | **Oscar:** "the onboarding 'Connect calendar' button now works (`/api/calendar/sync` returns `{ imported }`)." **Adel:** "real Google busy blocks are now in the DB for the demo user; the reset route must not wipe them (or must re-sync)." |

### Always-on rules
- **Before every part:** `git pull origin main` into `backend_a`.
- **Commit at least hourly** even mid-part (`feat(engine): …`), and push so the branch is visible.
- **Shared files** (`types/*`, `package.json`, `next.config.mjs`, `app/layout.jsx`): announce before editing and get approval; then do it as its own tiny PR.
- **Never merge a contract change silently.** If `npm test` (`tests/contracts.test.js`) fails because of your change, stop and notify.

---

## Order and checkpoints
- **Fri 8:30–11 PM (walking skeleton):** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7d (constants) → 8 → 9. **11 PM checkpoint.**
- **Fri 11 PM–1 AM (harden):** tests for 3/4/5/8, then 7a–7c.
- **Sat 9 AM–1 PM:** 10 → 11a → 11b → 11c.
- **Sat 2–8 PM:** 13 → 14.
- **Sat 8 PM–1 AM:** 12, bug fixes. Feature freeze 1 AM.

Each part: one Claude session ("I'm Anthony, do Part N"), one PR, `npm test && npm run lint && npm run build` before merging.

## Hand-offs
- **Mhammad:** `timingScore(category, startIso, endIso) → 0..1` (Mhammad writes it; constant 0.5 until then); `captionCards(cards) → Map<cardId, caption>` (11c); `buildFeed` filters (11a).
- **Oscar:** dedupe cards by `card.id` across pages; the `cards` array can be empty.
- **Adel:** RLS must let friends read each other's `busy_blocks`; `getTravelTimes` must cover every (user, place) pair.

## Verification (whole section)
- `npm test`: engine tests + `tests/contracts.test.js` (also `z.array(FeedCard).parse(buildFeed(makeCtx()).cards)`).
- `curl "localhost:3000/api/feed?debug=1"`: 10 valid cards, `debug.ms` < 500, sensible drop counts.
- Learning: POST `/api/interactions` `{action: "skip"}` twice on Bily Kun (`10000000-0000-4000-8000-000000000006`) → re-fetch → no `category: "bar"` in the top 10.
- Rain: no outdoor slot in Sat 13:00–18:00 local.
- Social: sign in with Google on the Vercel URL; real calendar events block feed slots.
