# PLAN: Sidequest @ CodeJam 16

> ## ✅ Status (Sat Nov 21, ~3 PM): the original plan is COMPLETE
> Everything in §1–§11 below is built, tested together and merged. **Live:** https://sidequest-two-smoky.vercel.app (final checkpoint `9981fb1`).
> **New work for tonight is in [§12: New tasks (N1–N5)](#12-new-tasks-for-tonight-n1n5).** Start there.

> **Read this first.** It tells you what you own, what you can rely on from others, and what "done" means.
> Product, schema and API details live in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). This file is *who does what, when*.
> If something here is unclear, fix this file (small PR) instead of asking in DMs, so everyone sees the answer.

---

## 0. Status: what's done

| Person | Done (tested together at the checkpoints) | Owner: please confirm |
|---|---|---|
| **Anthony** | A1–A9: feed engine (time grid, hard rules, 7-factor scoring, variety, swipe learning), search filters, Claude captions (with Vercel fix), demo tuning. S4 Google login, S5 Google Calendar sync (live: real timetables). First-time redirect + login protection. `docs/engine.md`, `docs/demo.md`. Vercel deploy | — |
| **Mhammad** | B1 timing score, B2–B3 Claude client + captions, B4–B5 search (**plain code word lists, not Claude**). S1 plans in Supabase, S2 live updates (Broadcast, < 1 s), S3 friends API + `/api/users` (real vs demo split), 409 for busy invitees | — |
| **Adel** | D1–D3 schema + RLS + 60 places, D5–D8 weather, travel times, seed/reset route, Supabase data layer. `ensureUser`, `replaceBusyBlocks`, `updateProfile`, `addFriendship`, neighbourhoods, interest tags | D4 real photos? · D9 Devpost draft? |
| **Oscar** | F1–F9: design system, feed + skip/save animations, Why sheet, invite sheet, plan screen, invite banner, My Plans, onboarding, You screen, tab bar, place/weather sheets, PWA | F10 search bar? · F11 polish? |

Verified at C4.5 / final: 345 tests, 0 calendar conflicts across all 4 real accounts, invites + RSVPs live in < 1 s.

---

## 1. Who owns what

| Person | Role | You own (only you edit these) | Branch |
|---|---|---|---|
| **Anthony** | **Engine, part A** + team lead | `lib/engine/` (except `timing.js`), `lib/time.js`, `app/api/feed/`, `app/api/interactions/` | `backend_a` |
| **Mhammad** | **Engine, part B: AI + timing**, then **Social** | `lib/engine/timing.js`, `lib/ai/`, `app/api/search/` · later: `lib/social/`, `lib/auth.js`, `hooks/`, `app/api/plans/`, `app/api/friends/`, `app/api/calendar/`, `app/(auth)/` | `backend_b` |
| **Adel** | **Data + schema** (+ Devpost writeup) | `supabase/`, `lib/data/`, `data/`, `lib/mocks/`, `app/api/dev/seed/` | `database` |
| **Oscar** | **Frontend** | `app/feed/`, `app/plans/`, `app/onboarding/`, `components/`, `app/globals.css` | `frontend` |

**Shared files** (announce in the team chat *before* editing, then do it in a tiny PR on its own):
`types/*`, `package.json` / `package-lock.json`, `app/layout.jsx`, `next.config.mjs`, `supabase/migrations/*` (Adel merges these), `PLAN.md`.

**Social comes last.** Login, Calendar sync, Realtime and friend management are scheduled for **Saturday afternoon** (§6.5). Until then the app already works for the demo without them:
- `lib/auth.js` uses a **"log in as" cookie** (`/api/dev/login-as?id=…`), so two browser windows can be two different people.
- `app/api/plans/*` already works on an **in-memory store**, and `hooks/usePlan.js` **polls** every 2 s.
So the full invite → "I'm in" loop can be demoed even if the social phase runs late. The social phase makes it *real* (persistent, instant, real Google account).

---

## 2. Getting started (everyone, ~10 min)

```bash
git clone <repo-url> && cd <repo>
npm ci
cp .env.example .env.local      # ask Anthony for the values in a private message, never in the repo
npm run dev                     # http://localhost:3000 → redirects to /feed
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build. **Must pass before you open a PR.** |
| `npm run lint` | ESLint |
| `npm test` | Vitest. `tests/contracts.test.js` checks that every mock matches `types/`. **This is our main safety net in JavaScript, so run it before every PR.** |

**Switch user (demo mode):** open `/api/dev/login-as?id=<userId>`. The placeholder `/feed` page has links for all 5 mock users.
Mock user IDs (also reused by the seed script):

| Name | ID | Notes |
|---|---|---|
| Sam (demo user, "you") | `00000000-0000-4000-8000-000000000001` | Will become the real Google account |
| Maya | `…000000000002` | Closeness 3. Busy weekday daytime, Sat morning shift |
| Karim | `…000000000003` | Closeness 3. Evening shifts Wed–Fri |
| Antoine | `…000000000004` | Closeness 2. Internship weekdays 9–5 |
| Léa | `…000000000005` | Closeness 1. Tue/Thu classes, Sun shift |

**Safety switches** in `.env.local`. Both default to `true`, which is the demo-safe setting:
- `USE_MOCK_DATA`: `true` = `lib/data` returns mocks. Set to `false` once Adel's Supabase data is live.
- `DEMO_MODE`: `true` = "log in as" cookie works. `false` = Supabase Google login only.

---

## 3. How we stay unblocked: contracts and mocks

Everybody codes against **contracts** that ship with the scaffold. Nobody waits for anybody; you swap a mock for the real thing whenever the other side is ready.

| Contract | File | Producer → Consumer | What you use until the real one lands |
|---|---|---|---|
| Domain types (Place, User, BusyBlock, Plan…) | `types/domain.js` | everyone | — |
| `FeedCard`, `ScoreBreakdown`, `FeedFilters` | `types/feed.js` | Anthony → Oscar, Mhammad | `lib/mocks/feedCards.js` |
| Request/response for every route (Zod) | `types/api.js` | route owners → Oscar | stub routes already return valid data |
| Data access functions | `lib/data/index.js` | Adel → Anthony, Mhammad | each function returns mocks today |
| Current user | `lib/auth.js` → `getSessionUserId()` | Mhammad → everyone | demo cookie, defaults to Sam |
| Live plan | `hooks/usePlan.js` → `{plan, loading, error, rsvp}` | Mhammad → Oscar | polling every 2 s |
| Template caption | `lib/ai/templates.js` | Mhammad → Anthony | already implemented |
| Engine tuning numbers | `lib/engine/config.js` | Anthony | already filled in |

**Contract rules**
1. The project is **plain JavaScript** (`.js` / `.jsx`). The contracts are **Zod schemas** in `types/`, which check data at runtime. Validate every request body with them (`parseBody()` in `lib/http.js`). Each schema has a JSDoc `@typedef` (e.g. `FeedCardT`), so VS Code still gives autocomplete. Use them in comments: `/** @param {import("@/types/feed").FeedCardT} card */`.
2. Changing a contract: post in the chat, then make one PR that touches `types/` and fixes the mocks. `npm test` will fail if a mock no longer matches.
3. Never change the **signature** of a `lib/data` function or `usePlan()`. Change the body.
4. Identity always comes from `getSessionUserId()`, never from a request body.
5. Timestamps: **ISO strings in UTC** everywhere. Use `lib/time.js` (`toLocal`, `formatSlot`, `atLocalTime`) for Montréal-time logic and display.

---

## 4. Already done (Phase 0 scaffold, goes to `main` in the first push)

- Next.js 16.4 (App Router, **JavaScript**, Tailwind v4, ESLint, `@/` import alias in `jsconfig.json`), with `zod`, `@supabase/ssr`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `luxon` and `vitest` installed. **Please don't add packages without telling the team.**
- `types/`: every shared contract.
- `lib/mocks/`: 20 places, 5 users + friendships, weekly schedules relative to today, hourly weather (staged rainy Saturday 13:00–18:00), 10 FeedCards.
- `lib/data/index.js`: all data functions, mock-backed, with a haversine travel-time fallback in `lib/data/geo.js`.
- `lib/supabase/{server,client,admin}.js`: Supabase clients (cookie pattern from `@supabase/ssr`).
- Stub API routes, all validating with Zod: `GET /api/feed`, `POST /api/interactions`, `POST /api/search`, `GET|POST /api/plans`, `GET /api/plans/[id]`, `POST /api/plans/[id]/rsvp`, `GET /api/friends`, `GET /api/me`, `POST /api/calendar/sync` (501), `GET /api/dev/login-as`.
- Tested by hand: Sam creates a plan inviting Maya → Karim gets 403 → Maya RSVPs "in" → status `confirmed`.
- `npm run build`, `lint` and `test` all pass.

**Still to do in Phase 0** (owner in brackets):
- [ ] Push to GitHub `main`, everyone has access [Anthony]
- [ ] Create Supabase project, send URL + keys privately [Adel]
- [ ] Connect repo to Vercel, add env vars (Production + Preview) [Anthony]
- [ ] Create Google OAuth client in the Google Cloud project; add all 4 of you + demo accounts as **test users** [Anthony]
- [ ] OpenRouteService API key [Adel]
- [ ] Anthropic API key [Mhammad]

---

## 5. Timeline

| Phase | When | Anthony | Mhammad | Adel | Oscar |
|---|---|---|---|---|---|
| **0 Setup** | Fri 7–8:30 PM | Repo, Vercel, Google OAuth client | Anthropic key, read `lib/ai` + skills | Supabase project, ORS key | Design direction, components list |
| **1 Foundation** | Fri 8:30 PM–1 AM | `slots.js` + tests, `candidates.js` | `timing.js` + tests, `captions.js` with Claude | Migration + RLS, start places list | Design system, `FeedCard` UI on mocks |
| **2 Core** | Sat 9 AM–2 PM | `scoring.js`, `diversify.js`, real `/api/feed` | NL search (`search.js`, `/api/search`) | Places done, weather, travel, **seed** → `USE_MOCK_DATA=false` | Feed snap scroll + Skip/Save/Go, invite sheet, plan screen |
| **3 Integrate + Social** | Sat 2–8 PM | `learning.js` + `/api/interactions`; **Google login + Calendar sync** | **Plans in Supabase + Realtime**, friends API | Rainy-day demo switch, reset script, photo pass | My Plans, onboarding, invite banner, search bar |
| **4 Polish** | Sat 8 PM–1 AM | Tune weights for the demo, bug-fix | Realtime hardening, caption quality | **Devpost draft**, screenshots | Animations, loading/empty/error states, phone testing |
| | **Sat 1 AM** | **FEATURE FREEZE** | | | |
| **5 Ship** | Sun 7–11:30 AM | Merges only (sole merger after 9 AM) | Demo laptop/phone setup | Devpost final, video if needed | Final UI fixes |
| | **Sun 11:30 AM** | **SUBMIT** (deadline 12:00) | | | |

**Integration checkpoints** (everyone, 10 min, at the table):
- **Fri 11 PM:** mock feed renders on Vercel; engine returns ranked JSON on mocks; migration applied.
- **Sat 1 PM:** real seeded data → real ranked feed on the live URL.
- **Sat 6 PM:** full loop on the live URL with two phones: feed → Let's go → invite on phone 2 → I'm in → confirmed.
- **Sat 11 PM:** demo rehearsal #1 (script in §8).

---

## 6. Per-person task lists

Each task has a **Done when** check. Don't call it done until you've actually run it.

### 6.1 Anthony: Engine, part A (`backend_a`)

> **Detailed breakdown:** [docs/engine-parts.md](docs/engine-parts.md) splits this section into 15 small parts (Part 0–14), each with its own tests and a table of **what Anthony will ask you, and when**. Mhammad, Adel and Oscar: skim the "Per-part sync points" table there so you know what's coming your way.

**Mission:** turn (users, busy blocks, places, weather, travel times, tag weights) into a ranked, diversified `FeedCard[]`. Pure functions in `lib/engine/`, unit-tested, all numbers from `config.js`.
**You consume:** `lib/data/*` (mocks now, real later), `timingScore()` from Mhammad, `captionCards()` from Mhammad.
**You produce:** `GET /api/feed` → `FeedResponse`, `POST /api/interactions`.
**Skills:** `nextjs-typescript-setup`.

| # | Task | Files | Done when |
|---|---|---|---|
| A1 | **Free slots.** For each day in the horizon, waking hours 09:00–23:00 local minus busy blocks = free intervals. Intersect the user's free time with each friend's. Keep ≥ 60 min. For each slot, list which friends are free for all of it. | `lib/engine/slots.js`, `slots.test.js` | Tests pass for: overlapping blocks, back-to-back blocks, a block crossing midnight, a block outside waking hours, a DST-safe day (use `lib/time.js`), no friends free. |
| A2 | **Candidates.** For each (slot, place): open for the whole visit (handle `close < open` = after midnight), slot ≥ `typicalDurationMin`, travel ≤ `ENGINE.maxTravelMin` for *everyone*, outdoor + rain > `ENGINE.rainCutoff` → drop. Trim each slot to the place's duration (pick the best start, e.g. meal time). | `lib/engine/candidates.js` + test | Museum closed Monday never appears on Monday; park never appears in the staged rainy Saturday afternoon. |
| A3 | **Scoring.** Each component 0–1, weighted by `SCORE_WEIGHTS`. interest = tag weights · place tags (+ user interests as a prior); friends = Σ closeness of free friends, normalized; weather; fairness = 1 − norm(max travel in group); novelty = not interacted with recently (`getRecentInteractions`); proximity = my travel time. **Timing comes from Mhammad's `timingScore()`.** Until it lands, use a constant 0.5. | `lib/engine/scoring.js` + test | `breakdown` matches the `ScoreBreakdown` type; total = Σ weight × component. |
| A4 | **Diversify.** Greedy re-rank: subtract `diversityPenalty` if the category appeared in the last `diversityWindow` cards; never the same place twice in one feed. | `lib/engine/diversify.js` + test | No 3 bars in a row on the mock data. |
| A5 | **`buildFeed()`** wires A1–A4 and returns `FeedCard[]` (id = `${placeId}:${slot.start}`). Apply `FeedFilters` (friendIds, dateRange, priceMax, categories, indoorOnly). Cursor = offset. | `lib/engine/index.js`, `app/api/feed/route.js` | `/api/feed` returns real ranked cards on mocks in < 500 ms; the response parses with `FeedResponse`. **Fri night target.** |
| A6 | **Captions hook-up.** After ranking, call Mhammad's `captionCards(cards)` for the current page; fall back to `templateCaption`. | `app/api/feed/route.js` | Feed still loads when `ANTHROPIC_API_KEY` is missing. |
| A7 | **Learning.** On interaction: for each tag on the place, `+alpha[action]` (save/go) or `−beta` (skip), clamped to [min, max]. Save through `setTagWeights`. | `lib/engine/learning.js`, `app/api/interactions/route.js` | Skip 3 bars → refresh → no bars in the top 10. **This is a demo moment. Make it obvious.** |
| A8 | **Google login + Calendar sync** (social phase, with Mhammad). See §6.5. | `app/(auth)/`, `lib/calendar/`, `app/api/calendar/sync/` | Demo user's real Google busy times show up as `busy_blocks`. |
| A9 | **Demo tuning.** Make sure the top 3 cards for the demo user are great (sunny park + 2 friends, a café, a cheap dinner). | `lib/engine/config.js` | Rehearsal looks good. |

**Gotchas:** compute in `America/Toronto` but store UTC. Luxon: `DateTime.fromISO(iso, { zone: "utc" }).setZone(TIMEZONE)`. Montréal is UTC−5 in November. Keep the engine pure (no fetches inside `lib/engine/`; the route loads data and passes it in) so it's testable.

---

### 6.2 Mhammad: Engine, part B (AI + timing) → then Social (`backend_b`)

**Mission, part B (Fri + Sat morning):** the "smart" layer on top of the ranking. It never decides the ranking itself, only explains it (captions) and translates requests (search). Plus the timing heuristic.
**Mission, social (Sat 2 PM onward):** make plans persistent and live. See §6.5.
**You consume:** `FeedCard[]` from Anthony's engine, `getFriends()` from `lib/data`.
**You produce:** `timingScore()`, `captionCards()`, `/api/search`, then plans/Realtime/auth.
**Skills:** `claude-api-tool-calling` (read it before writing any Claude code), `claude-api`, then `supabase-realtime`, `supabase-auth`.

| # | Task | Files | Done when |
|---|---|---|---|
| B1 | **`timingScore(category, slotStartIso, slotEndIso): number`** (0–1). Restaurants peak at lunch 11:30–13:30 / dinner 18:00–20:30; cafés morning/afternoon; bars after 20:00; viewpoints near sunset (Montréal in late Nov ≈ 16:15 local, so hardcode it or ask Adel for Open-Meteo `daily=sunset`); parks midday; activities/museums afternoon. | `lib/engine/timing.js`, `timing.test.js` | Tests: bar at 21:00 > bar at 14:00; restaurant at 12:30 > 15:30. **Mhammad writes this file himself** (Anthony does not stub it); until it is merged Anthony uses a constant 0.5. Tell Anthony when it is merged. |
| B2 | **Claude client.** Server-only wrapper around `@anthropic-ai/sdk` with a timeout (~4 s) and no retries on the hot path. Model: use a current fast model (check the `claude-api` skill for the current model IDs; don't guess). | `lib/ai/client.js` | Calling it with no API key throws a clear error, and callers catch it. |
| B3 | **`captionCards(cards: FeedCard[]): Promise<Map<cardId, caption>>`**. ONE batched call for ~10 cards. Prompt includes each card's place, slot (formatted with `formatSlot`), friend names, travel, weather. Ask for JSON `[{cardId, caption}]`, **validate with Zod**, ≤ 120 chars, no invented facts. Cache by `card.id` (in-memory Map is fine). Any failure → `templateCaption()` for that card. | `lib/ai/captions.js` + test (mock the client) | Feed loads in < 2.5 s with captions; with a bad key it still loads with template captions. |
| B4 | **NL search → filters.** "something cheap with Maya tomorrow night" → Claude returns `FeedFilters` (use tool calling / structured output per the skill). Give Claude: today's date in Montréal, the user's friend list (names + IDs), the category enum. Validate with Zod. Map relative dates using `lib/time.js`. | `lib/ai/search.js`, `app/api/search/route.js` | 5 test queries produce sensible filters; invalid output → 422, not a crash. Returns `SearchResponse` with a human `summary` ("Cheap · with Maya · Sat night"). |
| B5 | Wire `/api/search` to Anthony's `buildFeed(filters)`. | `app/api/search/route.js` | Typing the demo query changes the feed. |
| — | **Social phase** → §6.5 | | |

**Cut order if behind:** B4/B5 (NL search) is the *first* thing we cut in the whole project. B3 must ship.

---

### 6.3 Adel: Data + schema (`database`)

**Mission:** real, reliable data behind the `lib/data` functions, and a one-command demo reset.
**You produce:** the Supabase schema, the places dataset, weather + travel times, and the seed/reset scripts. You also own `lib/mocks/` and keep them matching the schema.
**Skills:** `supabase-database`, `supabase-storage`.

| # | Task | Files | Done when |
|---|---|---|---|
| D1 | **Migration + RLS** for the tables in PROJECT_CONTEXT §6, in snake_case: `users`, `friendships`, `busy_blocks`, `places`, `travel_times` (PK user_id+place_id+mode), `interactions`, `user_tag_weights` (PK user_id+tag), `plans`, `plan_members` (PK plan_id+user_id). Add CHECK constraints for the enums, FKs, indexes on `busy_blocks(user_id, start_at)` and `plan_members(user_id)`. RLS on **every** table: users read/write their own rows; friends can read each other's `busy_blocks` (needed for the feed); plan members can read their plans + members; `places` readable by everyone. Add `alter publication supabase_realtime add table plans, plan_members;` for Mhammad. | `supabase/migrations/0001_init.sql` | Applied to the Supabase project; a test query as a normal user can't read a stranger's rows. **Fri night.** |
| D2 | **Row mappers.** Small functions in `lib/data/mappers.js` that turn DB rows (snake_case) into the `types/domain.js` shapes (camelCase) and back. Parse rows with the Zod schema in dev, so a schema mismatch fails loudly instead of silently. | `lib/data/mappers.js` + test | A test maps one sample row of each table and passes `Place.parse()` etc. |
| D3 | **Places dataset (60–100)** in `data/places.json`, matching the `Place` schema exactly (validate with `z.array(Place)`). Start from the **canada.ca open-data list** for restaurants/cafés, then hand-add parks, viewpoints, bars and activities (aim for ≥ 8 per category). For each: coordinates, `hours` per weekday, tags (reuse the tag vocabulary in the mocks: `coffee, cheap-eats, views, outdoors, bars, live-music, art, museums, markets, brunch, iconic, free, late-night, cocktails, nature`), `indoor`, `typicalDurationMin`, `priceLevel`. | `data/places.json`, `tests/places.test.js` | `npm test` passes (the test parses the JSON with `z.array(Place)`); ≥ 60 places; every category has ≥ 8. |
| D4 | **Photos.** Public Supabase Storage bucket `place-photos`; upload one photo per place; store the public URL in `photo_url`. Use only freely licensed photos (your own, Unsplash, Wikimedia) and keep a credits list for Devpost. | Supabase dashboard (drag-and-drop upload) or the seed route, `data/photo-credits.md` | Every place has a working photo URL. |
| D5 | **Weather.** `getWeather(range)` from Open-Meteo: `https://api.open-meteo.com/v1/forecast?latitude=45.5017&longitude=-73.5673&hourly=temperature_2m,precipitation_probability,weather_code&timezone=UTC&forecast_days=8`. Map WMO `weather_code` → `WeatherIcon`. Cache for 30 min. Add **`FORCE_RAIN_SAT=true`** env override for the staged rainy afternoon. | `lib/data/weather.js` | Real hourly data comes back; the override makes Saturday 13–18 rainy. |
| D6 | **Travel times.** Precompute them in the seed (5 users × ~100 places is small): OpenRouteService matrix API `POST https://api.openrouteservice.org/v2/matrix/{profile}` with `Authorization: <key>`, body `{locations: [[lng, lat], …], sources, destinations, metrics: ["duration"]}`. **Coordinates are `[lng, lat]`.** Durations come back in seconds. ORS has **no public transit**: use `foot-walking`, and if > 25 min use `cycling-regular` as a stand-in for metro/BIXI. Any failure → haversine (`lib/data/geo.js`) with `is_estimate = true`. Check the free-tier limits in your ORS dashboard. | `lib/data/travel.js`, used by the seed route (D7) | `travel_times` is filled; `getTravelTimes()` reads from the DB. |
| D7 | **Seed + reset as an API route** (it's a route, not a Node script, so the `@/` imports and env vars just work, locally *and* on Vercel). `POST /api/dev/seed`, only when `DEMO_MODE=true` **and** the `x-seed-secret` header equals the `SEED_SECRET` env var. It wipes the demo tables and inserts users (same IDs as `lib/mocks/users.js`), friendships, busy blocks for the next 7 days (reuse `weeklyPatterns` from `lib/mocks/schedules.js`), places from `data/places.json`, and travel times. Uses `createAdminClient()`. Add `SEED_SECRET=` to `.env.example`. Run it with `curl -X POST http://localhost:3000/api/dev/seed -H "x-seed-secret: <secret>"`. | `app/api/dev/seed/route.js`, `lib/data/seed.js` | Calling it twice in a row gives the same clean state. Then flip `USE_MOCK_DATA=false` and the app still works. **Sat 1 PM target.** |
| D8 | Swap every `lib/data` function body to Supabase when `USE_MOCK_DATA=false`. Keep the mock branch. | `lib/data/*` | Both modes work. |
| D9 | **Devpost** (from Sat 8 PM): description, how it works (diagram of the engine steps), challenges targeted (Touch Grass, People First, Agent Solution), data sources + licences, screenshots from Oscar. | Devpost | Draft reviewed by the team Sat night. |

**Data source note:** canada.ca data is usually published under the *Open Government Licence – Canada*, which allows reuse **with attribution**. Check the dataset page, then credit it on Devpost and in the app footer.

---

### 6.4 Oscar: Frontend (`frontend`)

**Mission:** make it feel like a real app. Full-screen snap-scroll feed, instant reactions, a smooth invite flow, polished states. Phone-first (test at 390×844).
**You consume:** the `/api/*` routes (already returning valid mock data), `usePlan()`, the `FeedCard` / `PlanView` types, `formatSlot()`, `SCORE_WEIGHTS`.
**Skills:** `tailwind-design-system`, `react-ui-patterns`, `nextjs-typescript-setup`.

| # | Task | Files | Done when |
|---|---|---|---|
| F1 | **Design system.** Colour/spacing/radius tokens in `globals.css` (`@theme`), base components: `Button` (primary/ghost/icon), `Avatar` + `AvatarStack`, `Chip`, `BottomSheet`, `Toast`, `Skeleton`, `PriceLevel`, `WeatherBadge`. Mobile-first, accessible (focus rings, 44 px tap targets, `aria-label` on icon buttons). | `components/ui/*`, `app/globals.css` | A `/dev/ui` page shows them all (delete before freeze). |
| F2 | **FeedCard.** Full-bleed photo with a gradient; name · category · `$$`; `formatSlot()` time; friend avatars with travel min (show `~` when `travelIsEstimate`); weather badge; caption; **✕ Skip / ♡ Save / Let's go →**. | `components/feed/FeedCard.jsx` | Looks good on all 10 mock cards, including long names and 3 friends. |
| F3 | **Feed screen.** Vertical snap scroll (`h-dvh overflow-y-scroll snap-y snap-mandatory`, each card `h-dvh snap-start`). Load more with `nextCursor`. **Skip:** animate the card out, remove it, `POST /api/interactions`. **Save:** heart animation + POST. Loading skeleton, empty state ("Everyone's busy, try next week"), error state with retry. | `app/feed/page.jsx`, `components/feed/*` | Smooth on a real phone; skipping feels instant (optimistic). |
| F4 | **"Why am I seeing this?"** bottom sheet: one bar per `breakdown` component × `SCORE_WEIGHTS`, plain-English labels ("Interest match", "Friends free", "Good timing"…). | `components/feed/WhySheet.jsx` | Judges can read it in 3 seconds. |
| F5 | **Invite flow.** Let's go → sheet with friends pre-selected (the card's free friends, toggleable) → `POST /api/plans` (`placeId`, `slot.start/end`, `inviteeIds`) → go to `/plans/[id]`. Also send an interaction with `action: "go"`. | `components/plans/InviteSheet.jsx` | Plan created, lands on the plan page. |
| F6 | **Plan screen** `/plans/[id]`: photo, place, time, member list with RSVP state, **I'm in / Can't make it** buttons (only for invitees), status pill (pending/confirmed). Uses `usePlan(id)`, so it updates live. Confetti or similar when it becomes confirmed. | `app/plans/[id]/page.jsx` | In two windows (Sam + Maya via login-as), Maya's "I'm in" shows on Sam's screen within ~2 s. |
| F7 | **Invite banner** on the feed: poll `GET /api/plans` every 3 s; if any plan has my rsvp = `invited`, slide down "Sam invited you to Café Olimpico, Sat 2 PM" → tap to open the plan. (Mhammad may swap the polling for Realtime later; keep it in a hook `hooks/useInvites.js`.) | `components/plans/InviteBanner.jsx`, `hooks/useInvites.js` | The second phone sees the invite without refreshing. **This is the demo's wow moment.** |
| F8 | **My Plans** `/plans`: upcoming list, confirmed vs pending sections, empty state. | `app/plans/page.jsx` | Shows the plans made in F5. |
| F9 | **Onboarding** `/onboarding` (light): 3 steps: connect calendar (button calls `/api/calendar/sync`; show "using sample schedule" on 501), pick ~5 interests (chips from the tag vocabulary in §6.3), see friends (`GET /api/friends`). | `app/onboarding/*`, `components/onboarding/*` | Can be clicked through in 20 s on stage. |
| F10 | **Search bar** (only if Mhammad's B4 ships): top of the feed, `POST /api/search`, show `summary` + filter chips with an ✕ to clear. | `components/feed/SearchBar.jsx` | Demo query re-filters the feed. |
| F11 | **Polish:** transitions, haptic-feeling button presses, safe-area padding, PWA manifest (name/icon), no layout shift. | — | Rehearsal on two real phones looks good. |

**Gotchas:** for remote images either use `<img>` or add the hosts to `images.remotePatterns` in `next.config.mjs` (shared file: announce it). `next.config.mjs` has `cacheComponents: true`: pages reading cookies or uncached data need a `<Suspense>` boundary. Read `node_modules/next/dist/docs/` for anything Next 16-specific (see `AGENTS.md`).

---

### 6.5 Social phase (Sat 2 PM onward): Mhammad, with Anthony

Done **last** on purpose. The demo already works without it (§1). Goal: make it real and instant.

| # | Task | Owner | Files | Done when |
|---|---|---|---|---|
| S1 | **Plans in Supabase.** Replace `lib/social/plans-store.js` bodies with queries on `plans` / `plan_members`. Same signatures, same "confirmed when one invitee is in" rule. Writes go through the server (admin client after checking membership with `getSessionUserId()`) so they work in demo mode too. | Mhammad | `lib/social/plans-store.js` | Plans survive a server restart and work on Vercel. |
| S2 | **Realtime.** In demo mode the browser isn't a Supabase-authenticated user, so RLS-protected **Postgres Changes won't arrive**. Use **Broadcast** instead: after any plan write, the server sends `plan:<id>` / `user:<id>:invites` events, and clients subscribed with `lib/supabase/client.js` refetch through the API. Swap the polling in `usePlan` / `useInvites` for this; **keep polling as a fallback**. | Mhammad | `hooks/usePlan.js`, `hooks/useInvites.js`, `lib/social/realtime.js` | Invite appears on the second phone in < 1 s; still works (slower) if Realtime drops. |
| S3 | **Friends API**: `POST /api/friends` (`AddFriendRequest`) for onboarding. | Mhammad | `app/api/friends/route.js` | Oscar's onboarding can add a friend. |
| S4 | **Google login** with Supabase Auth (Google provider configured with Anthony's OAuth client; redirect URLs for localhost + Vercel). `/login` page, `app/auth/callback/route.js` (exchange code for session), session refresh in `proxy.js` (Next 16 renamed middleware to *proxy*; read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). `getSessionUserId()`: Supabase user first, demo cookie as fallback when `DEMO_MODE=true`. On first login, insert a `users` row. | Anthony + Mhammad | `app/(auth)/login/`, `app/auth/callback/`, `proxy.js`, `lib/auth.js` | Demo user signs in with Google on the live URL; friends still use login-as. |
| S5 | **Calendar sync.** Request the Calendar read-only scope at sign-in (verify the exact scope string in Google's docs). The Google `provider_token` is only available right after the callback, so **sync busy times during the callback**: call Google Calendar `freeBusy` for the next 7 days and write `busy_blocks` with `source='google'`. `/api/calendar/sync` re-syncs if a token is still available, else 501. | Anthony | `lib/calendar/google.js`, `app/api/calendar/sync/route.js` | Demo user's real events block out feed slots. **Cut if it fights back; seeded schedules are fine.** |
| S6 | **Add to calendar on confirm** (stretch): `.ics` download link on the confirmed plan screen. | Mhammad | — | Stretch only. |

---

## 6.6 Team sync protocol (everyone)

When your work touches someone else's, there are three kinds of sync point. Claude is told (in CLAUDE.md) to **stop and tell you** at each one:

| Type | When | What you do |
|---|---|---|
| **CHECK** | You need a fact from a teammate that could change your code | Ask them in the team chat *before* building on an assumption |
| **APPROVE** | Your decision affects someone else (contract, shared file, product rule) | Get a 👍 in the chat *before* merging |
| **COMMIT + NOTIFY** | You produced something a teammate depends on | Commit → push → merge the PR → post the message below |

**Notify message template:**
> `[<area>] <what> is on main (PR #n). @<who>: <what to change on your side>. Contract: <file / signature>. Questions → reply here.`

**Always:** pull `main` before starting a task · commit and push at least hourly · any change to `types/*` needs 👍 from every consumer before merging · if `npm test` fails because of your change, stop and tell the team.

---

## 7. Git workflow (short version; the `git-team-workflow` skill has the rest)

- `main` always builds; Vercel deploys from it. Branch from `main`, use **your branch only**.
- Push **at least hourly**. `git pull origin main` into your branch every ~2 h.
- PR to `main` when `npm run build` passes. Keep PRs small. One teammate glances at it, then merge.
- Conventional Commits: `feat(feed): snap scroll`, `fix(engine): midnight hours`, `chore: seed script`.
- Never commit `.env.local`. Never force-push. Never edit another person's folder without asking.
- **Sunday after 9 AM: only Anthony merges, fixes only.**

---

## 8. Demo (~2 min) and who drives what

| Step | What happens | Depends on |
|---|---|---|
| 1 | Problem: "Plans die in the group chat." (15 s) | pitch |
| 2 | Open feed: what + when + who, caption, travel times | Oscar F2/F3, Anthony A5, Mhammad B3 |
| 3 | Tap "Why am I seeing this?" | Oscar F4 |
| 4 | Skip 3 bars → refresh → bars gone | Anthony A7 |
| 5 | Let's go → phone 2 gets the invite live → I'm in → confirmed on phone 1 | Oscar F5–F7, Mhammad S2 (or polling) |
| 6 | Type "something cheap with Maya tomorrow night" | Mhammad B4, Oscar F10 (cut if not ready) |
| 7 | Close: impact + what's next | pitch |

**Demo safety:** call the seed route (`POST /api/dev/seed`) right before going on stage · keep `USE_MOCK_DATA=true` as a backup · two phones logged in (Sam = Google, Maya = login-as) · have a screen recording of the full loop in case the Wi-Fi dies.

---

## 9. Cut list (in this order, if we're behind)

1. NL search (B4, B5, F10)
2. Google Calendar sync (S5): seeded schedules instead
3. Google login (S4): demo cookie instead
4. Fairness component (constant 1)
5. Real photos: placeholders + a few hand-picked
6. Realtime (S2): polling already works

**Never cut:** ranked feed with what/when/who, Skip/Save/Go, visible learning, invite + RSVP, captions (template fallback counts), live URL.

---

## 10. Decisions made (don't re-litigate)

| Question | Decision |
|---|---|
| Team | Anthony (engine A + lead), Mhammad (engine B: AI + timing, then social), Adel (data + Devpost), Oscar (frontend) |
| Routing API | **OpenRouteService** (free key; no transit, so walking + cycling proxy + haversine fallback) |
| Google Cloud project | **Anthony's**: OAuth client + test users |
| Restaurant data | **canada.ca open data** (public, attribute it) + hand-curated additions |
| Social features | **Last** (Sat 2 PM+). Demo-mode cookie + polling cover the demo until then |
| Timezone | Store UTC, compute in `America/Toronto` via `lib/time.js` |
| Language | **JavaScript** (`.js`/`.jsx`), not TypeScript. Zod schemas in `types/` are the contracts; JSDoc typedefs for editor hints |
| Validation | Zod v4 everywhere at API boundaries |

## 11. Still open

- [ ] Exact challenge descriptions and prize structure (ask organizers Friday night). Confirm "Touch Grass" / "People First" / "Agent Solution" fit. *(Note: Claude is now used only for captions, so "Agent Solution" is a weak fit; focus Touch Grass + People First.)*
- [x] Which real Google account is the demo user? → real accounts for all 4 of us (backup: anthonythehelou@gmail.com → Sam)
- [ ] App name: keep "Sidequest"?

---

## 12. New tasks for tonight (N1–N5)

> These are **new** (added Sat ~3 PM after using the live app), not leftovers. **Order: N5 → N2 → N3 → N1 → N4 (if time).**
> **C5 checkpoint: trial merge + full test at ~11 PM**, then merge, then **feature freeze at 1 AM**.
> Every contract change (`types/*`) still needs a 👍 from its consumers first (§6.6).

### N5: Per-person travel times from postal codes (bug fix, do FIRST, ~1 h)
**Problem:** the postal-code home never saves. `updateProfile`'s input schema is `.strict()` without `home` (`lib/data/index.js` ~271), so `PATCH /api/me {postalCode}` returns 400. No screen sends a postal code yet; the `HOME_AREA` check doesn't exist; mock `getTravelTimes` ignores edited homes (uses `mockUsers`, not `allMockUsers()`, ~172). Result: all 4 of us are "Downtown", with near-identical travel times.

| Owner | Task | Done when |
|---|---|---|
| **Adel** | `updateProfile` accepts a server-only `home {lat, lng}` (the route passes it, never the client body); add a `HOME_AREA` check (Greater-Montréal bounding box → 400 outside); recompute that user's travel times (existing `recomputeTravelTimes`, `lib/data/db.js` ~134); fix mock `getTravelTimes` to use `allMockUsers()` | Un-mocked test: PATCH `{postalCode: "H2T 1S6"}` → home saved + 60 travel rows recomputed |
| **Mhammad** | Merge `cc2c5c6` (Québec codes); add a route test that does NOT mock `updateProfile` | Test passes end to end |
| **Oscar** | Postal-code field in onboarding + You screen (neighbourhood stays as fallback); show the 400 message | Entering a code updates the You screen |
| **Everyone** | Enter your real postal code | — |
| **Anthony** | Audit the 4 feeds: different per-person travel on cards, fairness varies, still 0 conflicts | Audit shows different travel times |

### N2: Variety on every visit (weighted shuffle, Anthony, ~45 min)
**Problem:** ranking is fully deterministic, so every visit shows the same cards in the same order.
- `GET /api/feed?seed=<n>`: the feed picks a **random seed per visit** and reuses it for every page of that session (pages stay consistent).
- Engine: before variety, add a small seeded jitter to each score (`ENGINE.shuffleJitter`, ~±0.08). Close scores reshuffle per visit; the best stay near the top; hard rules untouched.
- Places shown in your last sessions drop a little: the client sends recently-seen place ids (localStorage, last ~30) as `seen=`; scoring applies a small penalty.
- **Contract:** `FeedQuery` gets `seed?`, `seen?` → 👍 Oscar + Mhammad (search uses `buildFeed`). **Oscar:** generate the seed + send `seen`.
- **Done when:** same seed → same order; different seeds → different top-10 orders; the top 3 stay within the best ~6; all existing tests pass.

### N3: Endless feed, prefetched (Anthony server + Oscar client, ~1.5 h)
**Problem:** the next page loads only when card 9 of 10 is visible (no prefetch), and the feed just stops after one card per place (~57 cards).
- **Server (Anthony):** cursor becomes `pass:offset`. Pass 1 = best slot per place (today). Pass 2 = each place's **other** good time (another day). Pass 3+ = loop, reshuffled with `seed + pass`. Only empty when there are truly 0 places. Loop cards get the pass in their id (`${placeId}:${slot}:${pass}`) → contract note on `FeedCard.id` → 👍 Oscar.
- **Client (Oscar):** fetch the next page as soon as card ~5 of the current page is visible (sentinel at `cards.length - 5`), preload its photos (`new Image().src`), never show a dead end, keep dedupe by id.
- **Done when:** scrolling 40+ cards never waits on a skeleton on normal Wi-Fi, and never ends.

### N1: Cuisine search over the whole business list (Adel + Mhammad + Anthony + Oscar, ~2–3 h)
**Problem:** "indian food" → all 11 curated restaurants (none Indian). The full list (`public.businesses`, ~55k health-registry rows) has only name, address, lat/lng, French type and status: **no cuisine, hours, price or photo**. Cuisine can only be guessed from names.

| Owner | Task |
|---|---|
| **Adel** | `lib/cuisines.js` (pure data, client-safe): cuisine → name keywords (indian: indien/indienne/tandoori/curry/masala/punjab/biryani…; ~15 cuisines). `searchRegistry({ cuisine, near: {lat, lng}, radiusKm: 6, limit: 40 })` in `lib/data`: open (`statut = 'Ouvert'`) `Restaurant*` rows with lat/lng whose name matches the keywords (exclude Épicerie etc.) → Place objects: deterministic UUID from `business_id`, `category: "restaurant"`, `tags: [cuisine]`, **assumed hours 11:30–22:00 daily**, `typicalDurationMin: 60`, `indoor: true`, `priceLevel: 2`, placeholder photo, `source: "registry"`, `hoursVerified: false`. Also tag curated places with their cuisine. `ensurePlaceFromRegistry(place)` upserts into `places` when a plan is created (plans need a real place row). |
| **Mhammad** | `parseSearch`: cuisine words → `filters.cuisine` (from `lib/cuisines.js`), summary "Indian"; `/api/search` adds registry places to the engine context when `cuisine` is set. |
| **Anthony** | `FeedFilters.cuisine` → the engine keeps only places tagged with that cuisine; registry places get straight-line travel estimates ("~"); `hoursVerified: false` passes through to the card. **Contract:** `FeedFilters.cuisine`, optional `Place.source` / `hoursVerified` → 👍 everyone. |
| **Oscar** | Card badge **"Hours not verified · call ahead"** when `hoursVerified === false`. |

**Done when:** "indian food tonight" returns only Indian places (curated or registry), each with real friends and time slots, unverified ones clearly labelled; "pizza" → only pizza places.

### N4: Book-it assistant (PLANNED now; build only after N5/N2/N3/N1 are merged)
On a **confirmed** plan, the organizer taps **Book it**:
- **Data (Adel):** places get optional `phone`, `website`, `bookingUrl`, `bookingType` (`online | phone | walk-in`), filled in for the 60 curated places. Registry places → unknown → "walk-in / search the name".
- **API (Mhammad):** `POST /api/plans/[id]/booking` (creator only, confirmed only) → checks the place is open for the whole slot (reuse Anthony's hours check: export `isOpenDuring(place, startIso, endIso)` from `lib/engine/candidates.js`) and party size = members "in" → returns a pre-filled message ("Table for 3, Sun 17:30, under Anthony") and stores `booking_status: requested` on the plan (new column + migration).
- **UI (Oscar):** a button on the plan screen after the RSVP block (creator + confirmed only) → sheet with party size, time, **Open booking page / Call / Copy message**, then **Mark as requested** → the plan shows "Reservation requested".
- No fake real reservations: honest on stage. **Contract:** Place fields + `PlanView` booking → 👍 everyone.

### If we're behind (cut in this order)
1. N4 → keep as documented post-hackathon work.
2. N1 registry part → keep cuisine tags on the curated places only.
3. N3 loop passes → keep the early prefetch.
