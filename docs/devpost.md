# Sidequest: Devpost draft

> **Status:** draft for team review (PLAN.md D9, Phase 4). Owner: Adel.
> Paste each section below into the matching Devpost field. Everything marked **[TODO]** needs a person.
> The "Notes for the team" section at the bottom is not for Devpost.
> Facts were checked against `main` at the C4 checkpoint (2026-11-21). Engine numbers come from `docs/engine.md`.

---

## Project name

Sidequest

## Tagline

Instagram shows you what your friends did. Sidequest shows you what you could do together this week.

---

## Inspiration

Plans die in the group chat. Someone says "we should do something this weekend", four people reply with different free times, nobody picks a place, and everyone stays home. The problem is never a shortage of things to do in Montréal. It's two decisions nobody wants to make: **when** are we all free, and **what** should we do then?

We wanted an app that makes both decisions for you, using information you already have: your calendar, your friends, and the city around you.

## What it does

Sidequest is a vertical, full-screen feed, like Instagram or TikTok. Instead of reels, every card is a real suggestion that answers three questions at once:

- **What:** a real Montréal place (café, restaurant, bar, park, viewpoint or activity), with its photo and price level.
- **When:** a real time slot when you are actually free, e.g. *"Sat 2:00–4:00 PM"*.
- **Who:** the friends who are free for that whole slot, and how long it takes each of them to get there.

Each card also shows the weather for that hour and a one-line reason, e.g. *"Lunch at Arepera du Plateau Sunday noon, with Karim, Antoine and Léa."*

The core loop:

1. **Scroll** suggestions that fit everyone's real free time.
2. **Tap "Let's go"**: your friends get the invite on their phone within seconds.
3. **A friend taps "I'm in"**: the plan is confirmed.
4. **Skip a few bars**: bars disappear from your feed. The feed visibly learns your taste.

You sign in with Google, and Sidequest reads only the start and end times of your calendar events. A short onboarding asks for your neighbourhood and interests and lets you add friends. A **"Why am I seeing this?"** sheet on every card shows exactly how it was scored. A search box takes plain requests like *"something cheap with Maya tomorrow night"* and narrows the feed.

## How we built it

**Stack:** Next.js (App Router) and React in plain JavaScript, Tailwind CSS, Supabase (Postgres, Auth with Google, Storage), the Claude API, deployed on Vercel. Zod schemas are the contract between the four of us, and they validate every API boundary at runtime.

### The feed engine (the technical core)

Every feed load runs a deterministic pipeline on the server, in plain code with no AI. It checks about **10,500 possible visits** in about **120 ms** on our real data:

```
 Google Calendars ─┐
 Places (60) ──────┤
 Weather (hourly) ─┼─▶ 1. Time grid ─▶ 2. Hard rules ─▶ 3. Score ─▶ 4. Variety ─▶ 5. Cards ─▶ 6. Caption
 Travel times ─────┤     (30-min       (never          (7 factors)  (1 per place,   (what + when   (Claude, or
 Your swipes ──────┘      slots)        broken)                     mixed types     + who)         a template)
                                                                    and days)
```

1. **Time grid.** The next 7 days are cut into 30-minute slots between 9:00 and 23:00, Montréal time. For each slot we know who is free, which places are open, and the hourly forecast.
2. **Hard rules, never broken.** A visit is dropped unless the place is open the whole time (including split lunch/dinner hours and bars closing after midnight), you and at least one friend are free the whole time, nobody travels more than 35 minutes, and it isn't an outdoor place when the chance of rain is above 60%. Missing data is never invented: no opening hours means closed, and no travel time means that person can't come.
3. **Scoring.** Seven factors, each from 0 to 1, with fixed weights. This is exactly what the "Why am I seeing this?" sheet shows:

   | Factor | Weight | What it measures |
   |---|---|---|
   | Interest | 30% | Place tags vs your interests and what your swipes taught us |
   | Friends | 20% | Share of your friends free, weighted by how close you are |
   | Timing | 15% | Restaurants at mealtimes, bars after 8 PM, viewpoints near sunset |
   | Weather | 10% | Warm and dry favours outdoors; rain favours indoors |
   | Fairness | 10% | The longest trip in the group, so nobody gets the 35-minute trek |
   | Novelty | 10% | Places you haven't seen or skipped recently |
   | Proximity | 5% | Closer to you is a little better |

4. **Learning from swipes.** Skip, Save and Let's go update a personal taste profile per tag and per category. Two skips of bars push the whole category down hard, so bars leave your top 10. Skipping a bar that also serves coffee barely touches "coffee", so the feed learns "not bars", not "not coffee".
5. **Variety.** One card per place. The feed avoids back-to-back cards of the same category or the same day.

### Where AI is used, and where it isn't

We deliberately kept AI out of the ranking. Finding free time, checking hours, travel and weather, scoring, learning and variety are all deterministic and tested.

- **Captions: Claude** (`claude-haiku-5-5`). One batched call writes the line on each card, using only that card's own facts. It never ranks, never sees calendars, and is told never to invent prices, menus or events. The output is validated with Zod. If Claude takes longer than 2.5 seconds or fails, a template caption appears instantly, so the feed never waits on the model.
- **Search: plain code.** Agreed word lists turn *"something cheap with Maya tomorrow night"* into filters (budget, Maya must be free, 18:00–23:00), and the engine does the actual finding. It's instant and free, and it can't misread a request into something you didn't say.

### Real calendars, privately

You sign in with Google. We request read-only calendar access, and we read **only the start and end times** of events, never titles, locations, descriptions or attendees. All-day, declined and cancelled events are ignored. Your home is stored as a neighbourhood centre, never an exact address.

### Data

- **60 hand-curated Montréal places**: 11 restaurants, 12 activities, 10 bars, 9 cafés, 9 parks and 9 viewpoints, with opening hours checked by hand. Restaurant, café and bar addresses and coordinates were cross-checked against the City of Montréal's open data on food businesses. Parks, viewpoints and activities were located with OpenStreetMap.
- **Real travel times** from OpenRouteService: walking, switching to cycling as a stand-in for metro/BIXI when the walk is over 25 minutes. We precompute them for every person and place.
- **Real hourly weather** from Open-Meteo, with a switch to stage a rainy afternoon for demos.
- **Supabase Postgres** with Row Level Security on every table: friends can see each other's busy times, nobody can see a stranger's. A one-command reset puts the demo world back in a clean state.

### Testing

**310 automated tests**, including bugs we planted on purpose to prove the tests catch them. The engine is made of pure functions, so we could test the tricky cases directly: busy blocks crossing midnight, a daylight-saving week, bars that close at 3 AM, and parks during a rain shower.

## Challenges we ran into

- **Calendar intervals are a trap.** Intersecting free time across five people with overlapping, back-to-back and after-midnight events produced off-by-one bugs. Moving to a 30-minute grid made every rule simple and testable.
- **Opening hours that cross midnight.** "15:00–03:00" means the bar is open on two calendar days. We had to encode that rule once and use it everywhere.
- **No public transit in our routing API.** OpenRouteService has walking, cycling and driving, but no metro. We use cycling as the stand-in for longer trips and mark straight-line estimates with "~" so we never present a guess as a fact.
- **Security vs a live demo.** Row Level Security protects real users, but in our demo mode the browser isn't a signed-in Supabase user. We route writes through the server with explicit membership checks, and invites update by polling so they still work when real-time events wouldn't.
- **Keeping AI honest.** It was tempting to let the model pick the places. We kept it to captions, built on the card's own facts with a template fallback, so the ranking stays explainable and the demo never depends on model latency.

## Accomplishments that we're proud of

- Every card is **true**: a real place, open at that time, reachable, on a slot when everyone shown is actually free.
- The ranking is **explainable**. The "Why am I seeing this?" sheet shows the same numbers the engine used.
- The feed **learns live on stage**: skip two bars, refresh, and they're gone.
- **Real Google calendars**, read privately (start and end times only).
- 310 tests and a one-command demo reset, all built from scratch in under 40 hours by four people.

## What we learned

- Deterministic code plus a small, well-fenced AI layer beats "ask the model" for anything users need to trust.
- Contracts first: agreeing on Zod schemas and mock data on Friday night let four people build in parallel and connect the pieces without surprises.
- Privacy is a design choice. Reading only event times, and storing a neighbourhood instead of an address, cost us nothing and made the app feel safer.

## What's next for Sidequest

- **Events:** add concerts, shows and city events (Ticketmaster and the City of Montréal's events data) as time-bound cards.
- **Public transit** travel times (STM/GTFS) instead of the cycling stand-in.
- **Continuous calendar sync** instead of syncing at each sign-in.
- **Group mode:** one feed for a whole friend group, and instant invites with real-time push.
- **More of Montréal:** grow beyond 60 curated places, with photos of our own for every venue.

---

## Built with

`next.js` · `react` · `javascript` · `tailwindcss` · `supabase` · `postgresql` · `claude` · `anthropic` · `google-calendar-api` · `openrouteservice` · `open-meteo` · `openstreetmap` · `zod` · `vitest` · `luxon` · `vercel`

## Challenges we're entering

> **[TODO — team decision]** PLAN.md §11 still lists "confirm challenge fit" as open. Recommendation below.

- **Touch Grass:** Sidequest's whole goal is getting friends off their phones and out together. It suggests parks, viewpoints and walks, and its rain rule keeps outdoor plans realistic.
- **People First:** it puts friends first (the "who" on every card and the fairness score), and it treats privacy as a feature: event times only, a neighbourhood instead of an address, and a ranking you can inspect.
- **Agent Solution: probably drop it.** Our only AI is captions, and search is plain code. Only enter if the official description rewards a carefully fenced AI component rather than an autonomous agent.

## Data sources and licences

| Source | Used for | Licence and credit |
|---|---|---|
| [City of Montréal open data](https://donnees.montreal.ca) (food businesses) | Checking restaurant, café and bar addresses and coordinates | CC BY 4.0, credit "Ville de Montréal" |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via Nominatim | Locating parks, viewpoints, activities and neighbourhood centres | ODbL, "© OpenStreetMap contributors" |
| [OpenRouteService](https://openrouteservice.org) | Walking and cycling travel times | CC BY 4.0, "© openrouteservice.org by HeiGIT, Map data © OpenStreetMap contributors" |
| [Open-Meteo](https://open-meteo.com) | Hourly weather forecast | CC BY 4.0, "Weather data by Open-Meteo.com" |
| [Wikimedia Commons](https://commons.wikimedia.org) | 29 place photos | Per photo (CC0, CC BY, CC BY-SA, public domain), full list in `data/photo-credits.md` |
| Google Calendar API | Your busy times (start and end times only) | Read-only, with the user's consent |
| Claude API (Anthropic) | Card captions | — |

The same credits appear in the app: open the **You** tab and scroll to **About**. Each source links to its licence or attribution page.

## Try it out

- Live app: **[TODO — Vercel URL]**
- Code: https://github.com/Al-HelouAnthony/SonnetTheHedgehog **[TODO — confirm the repo is public before submitting]**
- Demo video: **[TODO — if we record one]**

## Screenshots (shot list)

Take these on a phone, or in a browser at 390 × 844, after the photo pass and a fresh reseed, so cards show real photos rather than placeholders.

1. **Feed card:** a top card with what, when, who, the travel times, the weather and the caption.
2. **"Why am I seeing this?"** sheet open on the same card (the score bars).
3. **Learning:** the top of the feed before and after skipping two bars.
4. **Invite:** the "Let's go" sheet with friends selected.
5. **Second phone:** the invite banner arriving, then the plan screen showing **Confirmed** after "I'm in".
6. **Rain rule:** the feed during the staged rainy afternoon, with no parks or viewpoints in that window.
7. **Onboarding:** the neighbourhood and interest pickers.
8. **The engine diagram** above, as an image.

---

## Notes for the team (not for Devpost)

Review checklist before we submit (deadline Sun 12:00, aim for 11:30):

- [ ] **Challenges:** confirm the official descriptions and decide on Agent Solution (see above).
- [x] **In-app credits:** done by Oscar (`frontend`, d5e8ec4), in "About" at the bottom of the You tab, with each source linked. Check it's on `main` after the next merge.
- [ ] **Live URL** and **public repo** for "Try it out".
- [ ] **Photos:** 31 of 60 places still have placeholders. After the photo pass, reseed (`POST /api/dev/seed`) before taking screenshots.
- [ ] **Numbers:** re-check "310 tests" and "about 120 ms" on the final `main` before submitting.
- [ ] **Team section** on Devpost: names, roles, Gmail or Devpost handles **[TODO]**.
- [ ] **Video:** decide whether to record the 2-minute demo as a backup (PLAN.md §8).
