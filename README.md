# Sidequest

**Instagram shows you what your friends did. Sidequest shows you what you could do together this week.**

A swipeable feed of real plans: every card is a **place or event**, at a **time when you and specific friends are all actually free**, with everyone's travel time and the weather. Swipe the bar, your friends get the invite live, they tap *I'm in*, and it's in everyone's Google Calendar.

Built in ~40 hours at **McGill CodeJam 16** (Nov 2026). Challenges: **Touch Grass** and **People First**.

**Live:** https://sidequest-two-smoky.vercel.app

---

## What it does

| | |
|---|---|
| **Feed** | Full-screen cards answering *what* (a place or a city event), *when* (a free slot for the group) and *who* (friends free for the whole visit, each with their travel time), plus a one-line reason written by Claude. |
| **Why am I seeing this?** | The 7-factor score behind every card: interest, friends free, timing, weather, fairness, novelty, proximity. |
| **It learns** | Skip two bars and bars leave your top 10 on the next refresh. Save / go push a category up. |
| **Plans** | Swipe *Let's go* → pick friends and time → invite. Friends see a banner in under a second, tap *I'm in* → confirmed → added to their Google Calendar (removed if they back out). |
| **Search** | "something cheap with Adel tomorrow night", "indian food tonight", "bowling": plain-language filters over our places, ~4,000 city events, 55,000 registry businesses and 2,500 OpenStreetMap venues. |
| **Start a sidequest now** | Break the bar: an open spot nearby + friends free in the next hour. |
| **During the plan** | Opt-in live status ("8 min away", "running late", never coordinates), shared memory photos, a **Book it** helper (booking link / phone / French+English message, the assistant reads the place's official website). |
| **Memories** | Every photo from your outings, story style. |

## How it works

```
Google Calendars · postal-code area · interests · friends
Places · city events · weather · travel times
        │
        ▼
Feed engine (plain code, ~200 ms): 30-min time grid with a 15-min buffer → hard rules
(open, everyone free, ≤ 35 min, no outdoor place in the rain) → 7 weighted scores → learning
from swipes → variety → cards → Claude caption (never ranks)
        │
        ▼
Plan → invite (Supabase Realtime) → RSVP → Google Calendar → Book it · live location · photos
```

Full explanation, concept by concept (how places are labelled, the exact scoring, why one restaurant beats another, who gets an invite and how): **[docs/engine.md](docs/engine.md)**.

## Tech

- **Next.js 16** (App Router, React 19, view transitions), **JavaScript** with **Zod** contracts (`types/`), **Tailwind CSS 4**
- **Supabase**: Postgres with row-level security on every table, Auth (Google), Storage (private photo bucket, signed links), Realtime Broadcast
- **Claude** (`claude-haiku-5-5`): card captions (one batched call, template fallback) and the booking assistant
- **Google Calendar API**: event times only at sign-in; plan events added/removed on RSVP
- **OpenRouteService** (travel times, postal-code geocoding), **Open-Meteo** (hourly weather)
- **Vitest** (626 tests) + Playwright checks · deployed on **Vercel**

## Project structure

```
app/                 pages (feed, plans, memories, friends, me, onboarding, login) + API routes (app/api/*)
components/          UI: feed cards, sheets, plans, memories, tab bar, design system (components/ui)
lib/engine/          the feed engine: slots, candidates, scoring, timing, learning, variety, start-now
lib/data/            data access (Supabase / mocks): places, events, registry, weather, travel, seed
lib/social/          plans, RSVP, live updates, photos, live location
lib/ai/              Claude client, captions, search parsing
lib/calendar/        Google Calendar sync + plan events
lib/booking/         Book it (contacts, booking assistant)
types/               shared Zod contracts (domain, feed, API)
supabase/            migrations + data imports (businesses, events)
docs/                engine.md (how it works), demo.md (demo runbook)
```

## Run it locally

```bash
npm ci
cp .env.example .env.local     # fill in the values (never commit .env.local)
npm run dev                    # http://localhost:3000
```

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm start` | production build / server |
| `npm test` | unit + contract tests (Vitest) |
| `npm run lint` | ESLint |

**Modes** (`.env.local`):
- `USE_MOCK_DATA=true` runs fully on built-in sample data (no Supabase or API keys needed).
- `DEMO_MODE=true` enables the "log in as" demo users (`/api/dev/login-as`).
- Production uses `USE_MOCK_DATA=false` and `DEMO_MODE=false` (Google sign-in only).

Without `ANTHROPIC_API_KEY` the app still works, with template captions.

## Privacy

Calendar **times only** (never titles) · home stored as a postal-code area (e.g. `H2T`), not an address · live location is opt-in, members only, 30 min around the plan, shown as status/ETA only · photos in a private bucket with expiring links · row-level security on every table · identity always from the session.

## Data and credits

- **Ville de Montréal open data**: events and the food-establishment registry ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))
- **© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors** (ODbL): venues
- **© [openrouteservice.org](https://openrouteservice.org/) by HeiGIT**: travel times and geocoding
- **Weather by [Open-Meteo.com](https://open-meteo.com/)**
- Place photos: sources and licences in [data/photo-credits.md](data/photo-credits.md)

## Team

| | |
|---|---|
| **Anthony** | feed engine, Google sign-in + Calendar, team lead |
| **Mhammad** | plans + live updates, search, Claude captions |
| **Adel** | data (places, events, registry, travel, weather), database + security |
| **Oscar** | design and frontend |
