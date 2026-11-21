# PROJECT CONTEXT — Sidequest (CodeJam 16)

> Working name: **Sidequest** (rename freely).
> This file is the single source of truth for the project. Read it fully before planning or writing code.

---

## 0. Instructions for Claude Code

You are the technical lead for a 3–4 person hackathon team. Your first job is **planning, not coding**.

1. Read this whole file.
2. Inspect the repository (it may be empty or freshly scaffolded).
3. Produce:
   - A **task breakdown** grouped by person (see §12), each task with: goal, files/folders it touches, dependencies, and a "done when" check.
   - A **dependency order** — what must exist first so people aren't blocked (schema + shared types first).
   - A **timeline** mapped onto the phases in §13.
   - A list of **open questions / risks** (see §16) — ask, don't guess.
4. Write the plan to `PLAN.md` and the shared Zod schemas (the contracts) to `types/` before feature work starts.
5. Then help implement tasks one at a time when asked.

Rules:
- Do not invent APIs, library methods or config. Check current docs when unsure.
- Keep secrets server-side. Never put API keys in client code or commit `.env.local`.
- Prefer the simplest thing that works and demos well. This is a ~40-hour build.
- Never claim something works without running it.
- Distinguish confirmed facts from assumptions.

---

## 1. Event facts (confirmed)

- **Event:** McGill CodeJam 16 (CodeJam 2026), run by the McGill Electrical, Computer & Software Student Society.
- **Where:** Lorne M. Trottier Building, McGill University, 3630 rue University, Montréal.
- **Hacking starts:** Friday Nov 20, 2026, 7:00 PM (Eastern).
- **Team check-in:** Sunday Nov 22, 10:00–11:00 AM.
- **Submission deadline:** Sunday Nov 22, **12:00 PM** (aim to submit by 11:30).
- **Judging:** Sunday 1:00–3:30 PM. **Closing ceremonies:** 4:30–5:30 PM.
- **Teams:** 3–4 people.
- **Rule:** projects must be created from scratch once hacking begins. No reusing past projects.
- **Challenges announced:** Fintech, Beginner, Sustainability, People First, Health, Undo Button, Touch Grass, Agent Solution, Bonus Track. (Detailed challenge descriptions not yet confirmed — see §16.)
- **Sponsors:** Tower Research Capital, Énergie 3R, 1Password, Zwaig & Stock | Scotia Wealth, Brim Financial, IBM, Lovable.
- **Prizes:** site says cash prizes across the challenges; exact structure not confirmed.
- **Reference only (last year, CodeJam 15):** 1st $1,000, 2nd $800, 3rd $600, plus $200 category prizes. Judging criteria were **Technical Complexity, Functionality, Creativity, Presentation**. Assume similar criteria unless told otherwise.

**Goal:** a top-3 finish. Target challenges: **Touch Grass** + **People First** (+ **Agent Solution** via the Claude layer).

---

## 2. The product

**One-liner:** *Instagram shows you what your friends did. Sidequest shows you what you could do together this week.*

An Instagram/TikTok-style vertical feed, but instead of reels, each card is a **real suggestion**: a place or activity (restaurant, café, park, viewpoint, bar, event) **at a specific time when you and specific friends are all free**.

Every card answers three questions:
- **What** — the place/activity
- **When** — a real free time slot (e.g. "Sat 2:00–4:00 PM")
- **Who** — which friends are free in that slot

### Problem
Making plans with friends dies in the group chat: nobody knows when everyone is free or what to do. Students default to staying in. Sidequest removes both decisions.

### Core loop (this is the demo)
1. Scroll the feed → suggestions that fit everyone's free time.
2. Tap **Let's go** → invite appears instantly on the friend's phone.
3. Friend taps **I'm in** → plan confirmed (and added to calendar if possible).
4. Skip a few bars → bars disappear from the feed. The feed visibly learns.

---

## 3. Feed card spec

- Full-screen photo of the place
- Name, category, price level ($–$$$$)
- Time slot: "Sat 2:00–4:00 PM"
- Avatars of free friends + each person's travel time
- Weather icon for that slot
- One-line reason written by Claude, e.g. *"You, Maya and Karim are all free, it's sunny, and it's ~15 min for everyone."*
- Buttons: **✕ Skip**, **♡ Save**, **Let's go →**
- Small "Why am I seeing this?" (score breakdown) — great for judges

---

## 4. Tech stack

- **Next.js (App Router) + JavaScript + React + Tailwind CSS** (team decision: JavaScript, not TypeScript) — mobile-sized web app (PWA-style), not native
- **Supabase** — Postgres, Auth (Google), Storage, Realtime
- **Claude API** (server-side only) — card captions + natural-language search
- **Google Calendar API** — free/busy for the demo user
- **Open-Meteo** — hourly weather (free, no key; verify)
- **Routing API** — Google Routes or OpenRouteService for travel times (cache results; haversine fallback flagged as estimate)
- **Leaflet + OpenStreetMap** — only if a map view is built (stretch)
- **Vercel** — deployment; preview URL per branch
- **Zod** — runtime validation at API boundaries

Environment variables (`.env.example`, no real values):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
ANTHROPIC_API_KEY=                # server only
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=             # server only
ROUTING_API_KEY=                  # server only
```

---

## 5. Folder structure (suggested — adapt to repo)

```
app/
  (auth)/login/            # Google sign-in
  onboarding/              # calendar, interests, friends
  feed/                    # main snap-scroll feed
  plans/                   # my plans + plan detail
  api/
    feed/route.js
    interactions/route.js
    plans/route.js
    plans/[id]/rsvp/route.js
    calendar/sync/route.js
    search/route.js
components/
  feed/  plans/  onboarding/  ui/
lib/
  engine/                  # slots.js, candidates.js, scoring.js, diversify.js, learning.js
  data/                    # places, weather, travel
  calendar/                # Google free/busy
  ai/                      # claude client, captions, search parsing
  supabase/                # server + browser clients
types/                     # shared Zod schemas = contracts (create FIRST)
supabase/migrations/
scripts/seed.js            # demo users, schedules, places
```

---

## 6. Database schema (Supabase)

```
users            id, name, avatar_url, home_lat, home_lng, interests text[], created_at
friendships      user_id, friend_id, closeness int (1–3), created_at
busy_blocks      id, user_id, start_at, end_at, source ('google'|'manual'|'seed')
places           id, name, category, tags text[], lat, lng, address, price_level int,
                 photo_url, hours jsonb (per weekday open/close), typical_duration_min,
                 indoor bool, created_at
travel_times     user_id, place_id, minutes int, mode, is_estimate bool
interactions     id, user_id, place_id, slot_start, action ('skip'|'save'|'go'), created_at
user_tag_weights user_id, tag, weight float          # learned from swipes
plans            id, creator_id, place_id, start_at, end_at, status ('pending'|'confirmed'|'cancelled')
plan_members     plan_id, user_id, rsvp ('invited'|'in'|'out')
```
- RLS on every table. Users read/write their own rows; plan members can read their plans.
- One person owns the schema; others request changes.

---

## 7. Feed engine (the technical core)

Runs server-side in `GET /api/feed`. Pure functions in `lib/engine/` so they're testable.

### Step 1 — Free slots
- Horizon: next 7 days, waking hours 9:00–23:00 (Montréal time).
- For the user and each friend: invert busy blocks → free intervals.
- Intersect the user's free intervals with each friend's (sort + merge). Keep slots ≥ 60 min.
- For each slot, record which friends are free for it.

### Step 2 — Candidates
For each (slot, place):
- Place is **open** for the whole visit (`hours`).
- Slot length ≥ `typical_duration_min`.
- Travel time for every participant ≤ a cap (e.g. 35 min).
- Weather: drop outdoor places if rain probability is high in that slot.

### Step 3 — Scoring (each component normalized 0–1)
```
score = 0.30·interest      # user tag weights · place tags
      + 0.20·friends       # number of free friends × closeness
      + 0.15·timing        # mealtime for restaurants, sunset for viewpoints, night for bars
      + 0.10·weather
      + 0.10·fairness      # 1 − normalized(max travel time in group)  (minimax)
      + 0.10·novelty       # not visited / not seen recently
      + 0.05·proximity
```
Weights live in one config object so they're easy to tune. Return the breakdown for "Why am I seeing this?".

### Step 4 — Diversify
Greedy re-rank: penalize a card if the same category appeared in the previous 3 cards. Avoid the same place twice in one feed.

### Step 5 — Learning from swipes
On interaction: `weight[tag] += α` for save/go, `−= β` for skip (clamp to a range). Next feed load reflects it. Must be visibly noticeable in the demo.

### Step 6 — Claude layer (on top, never deciding the ranking)
- **Captions:** batch the top ~10 cards into one call, return validated JSON `{cardId, caption}`. Cache. If it fails, use a template caption.
- **Natural-language search:** "something cheap with Antoine tomorrow night" → Claude returns validated filters `{friends, dateRange, priceMax, categories}` → run the normal engine with those filters.

### Shared type (define first in `types/`)
```ts
type FeedCard = {
  id: string;
  place: { id: string; name: string; category: string; photoUrl: string; priceLevel: number; lat: number; lng: number };
  slot: { start: string; end: string };          // ISO
  friends: { id: string; name: string; avatarUrl: string; travelMin: number }[];
  weather: { icon: string; tempC: number; rainProb: number };
  score: number;
  breakdown: Record<string, number>;
  caption: string;
};
```

---

## 8. API endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/feed?cursor=&filters=` | Ranked `FeedCard[]` |
| POST | `/api/interactions` | `{placeId, slotStart, action}` → update weights |
| POST | `/api/plans` | `{placeId, start, end, inviteeIds}` → create plan + invites |
| POST | `/api/plans/[id]/rsvp` | `{rsvp: 'in'|'out'}` |
| GET | `/api/plans` | User's upcoming plans |
| POST | `/api/calendar/sync` | Pull Google free/busy → `busy_blocks` |
| POST | `/api/search` | NL query → filters → feed |

All inputs validated with Zod. User identity always from the server session, never from the request body.

---

## 9. Screens (only 4)

1. **Onboarding** — connect Google Calendar, pick ~5 interests, add friends.
2. **Feed** — full-screen snap-scroll cards with Skip / Save / Let's go.
3. **Plan / invite** — place, time, who's in, RSVP buttons, live updates.
4. **My plans** — upcoming confirmed outings.

Mobile-first, polished, with loading / empty / error states. The feed should feel like a real app (smooth snap scroll, subtle animations).

---

## 10. Data and demo strategy

- **Places:** curated list of 60–100 Montréal spots (cafés, restaurants, parks, viewpoints, bars, activities) built during the event, with coordinates, hours, price, tags, indoor/outdoor, duration, photo. Optionally enrich photos via Google Places.
- **Pre-collected data:** a team member has a Montréal restaurant list compiled before the event. **Ask an organizer before using it** (rule: built from scratch). If not allowed, use the curated list.
- **Demo user:** real Google Calendar free/busy.
- **Friends:** seeded demo accounts with realistic student schedules (classes, shifts). Manual weekly-grid availability as a fallback.
- **Demo safety:** seed script that resets everything; a staged rainy afternoon to show weather filtering; never depend on live data that could break on stage.

---

## 11. Demo script (~2 minutes)

1. Problem (15s): "Plans die in the group chat."
2. Open the feed: cards show *what + when + who*. Point out the reason line and travel times.
3. Show "Why am I seeing this?" — the scoring breakdown (technical depth).
4. Skip a few bars → refresh → bars gone (learning).
5. Tap **Let's go** on a card → second phone gets the invite live → **I'm in** → confirmed.
6. Type "something cheap with Maya tomorrow night" → feed re-filters (Claude).
7. Close: impact + what's next.

---

## 12. Team split (assumes 4 people — merge rows if 3)

> **Superseded by [PLAN.md](PLAN.md)**, which has the final assignments with names (Anthony, Mhammad, Adel, Oscar), detailed tasks and timeline. The table below is the original draft.

| Person | Owns | Branch |
|---|---|---|
| 1 | **Feed engine:** slots, candidates, scoring, diversify, learning, `/api/feed`, `/api/interactions` | `feature/feed-engine` |
| 2 | **Data:** places list, hours, photos, weather, travel times, seed script, schema owner | `feature/data` |
| 3 | **Frontend:** feed UI, onboarding, plans screens, design system | `feature/frontend` |
| 4 | **Social + AI:** Google login + Calendar sync, plans/RSVP with Realtime, Claude captions + NL search, pitch & Devpost | `feature/social-ai` |

Unblock rule: Person 1 starts the engine against **mock data in `types/` shape** while Person 2 builds real data. Person 3 builds the feed against a **mock `/api/feed`** returning fixed `FeedCard[]`.

---

## 13. Timeline

| Phase | When | Goal / done when |
|---|---|---|
| 0 Setup | Fri 7–8:30 PM | Repo scaffolded, Supabase project, Vercel deploy live, `.env.example`, everyone can push |
| 1 Foundation | Fri 8:30 PM–1 AM | Schema + RLS, shared types, Google login, mock feed renders, engine returns ranked JSON on mock data |
| 2 Core | Sat 9 AM–2 PM | Real data seeded, real ranked feed, calendar sync for demo user, invite flow works |
| 3 Integrate | Sat 2–8 PM | Full loop end-to-end on live URL, swipe learning, Claude captions, Realtime RSVP |
| 4 Polish | Sat 8 PM–1 AM | Mobile polish, states, animations, NL search if time. **Feature freeze at end.** |
| 5 Ship | Sun 7–11:30 AM | Seed demo data, final deploy, Devpost, demo video if needed, rehearse 3×. Submit by 11:30. |

---

## 14. Git workflow

- `main` always builds (Vercel deploys from it). Scaffold pushed to `main` first, then everyone branches.
- One branch per person/feature (see §12). People mostly edit their own folders.
- Push at least hourly. `git pull origin main` into your branch every couple of hours.
- Merge to `main` via small PRs once `npm run build` passes; quick teammate look.
- Shared files (`package.json`, layout, `types/`, schema): announce in the team chat before editing.
- No secrets in the repo, no force-push. Sunday after ~9 AM: one person merges, fixes only.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `chore:`.

---

## 15. Scope control

**MVP (must ship):** onboarding (light), ranked feed with what/when/who, skip/save/go, learning from swipes, invite + RSVP with Realtime, captions, deployed URL.

**Cut first if behind:** NL search → fairness component → Google Places photos (use own) → real Google Calendar (fall back to seeded + manual grid).

**Stretch if ahead:** map view of the feed, group mode (feed for a whole friend group), photo check-in after the outing (Claude vision), add-to-calendar on confirm.

---

## 16. Open questions / risks (resolve early)

- **Exact team size and names** — fill in §12.
- **Challenge details (page 2 of the challenge list) and prize structure** — confirm from organizers; adjust target challenges.
- **Pre-collected restaurant data** — allowed or not?
- **Google OAuth:** app in testing mode → add every teammate/demo account as a test user.
- **API keys / costs:** routing and Places APIs may need billing; cache aggressively; have fallbacks.
- **Claude latency:** batch + cache captions; template fallback.
- **Timezones:** store UTC, compute in America/Toronto.
- **Demo reliability:** seeded data, reset script, two phones (or two browser windows) ready.

---

## 17. Skill files available

Attach the relevant one(s) when working on a task:
01 nextjs-typescript-setup · 02 react-ui-patterns · 03 tailwind-design-system · 04 git-team-workflow · 05 vercel-deployment · 06 supabase-database · 07 supabase-auth · 08 supabase-storage · 09 supabase-realtime · 10 claude-api-tool-calling · 11 agent-quest-planner (less central now) · 12 claude-vision-verification (stretch only)

No skill yet for: feed engine, Google Calendar, routing/travel times, weather, places data, pitch.
