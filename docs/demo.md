# Demo runbook: 5-minute presentation (Sun, judging 1:00–3:30 PM)

> Owner: Anthony. Checked Sun 10:15 on a read-only snapshot of production, simulated at demo time (Sun 1:30 PM):
> Anthony's real feed, real calendars, current `main` (variety, walkable preference, 15-min buffer, tab swipes).

**Phones:** Phone 1 = **Anthony** (presenter, mirrored on the screen). Phone 2 = **Oscar** (receives the invite, holds it up).
**Live URL:** https://sidequest-two-smoky.vercel.app

---

## 1. Before judging (do these in order)

> ✅ **Done Sun 10:40:** Anthony's learned weights were cleared (all 7 categories were at −0.5 or lower, so nothing could
> stand out). From now on **don't skip / save / Let's go on Anthony's account** except during a rehearsal or the demo.
> Scrolling and looking are fine.

| When | Step | Who |
|---|---|---|
| now | **Both phones: Add to Home Screen** (Share → Add to Home Screen / ⋮ → Install app). The app opens full screen, no URL bar: looks like a real app on the projector. Sign in there once. | Anthony, Oscar |
| now | **Oscar's phone: clear old invites.** Open Plans, answer or cancel every old pending invite, so the only banner on stage is the live one. | Oscar |
| now | **Anthony's phone: cancel old test plans** you organized (open the plan → Cancel plan). Cancelling also removes them from Google Calendar. | Anthony |
| 12:00 | **Rehearsal #1 with a timer (5 min)**, exactly as §2, Anthony + Oscar's phones. Others time it and note what to cut. | All |
| 12:15 | **Record the backup video** during rehearsal #2 (screen recording on Phone 1 + film Phone 2 receiving the invite). | Mohammad |
| 12:30 | After rehearsals: **cancel the rehearsal plans** (Anthony: plan → Cancel) and **reset** on the laptop: `node scripts/demo-reset.mjs` | Anthony |
| 12:35 | **Warm the captions:** Phone 1 opens the feed, waits ~5 s, taps **Feed** (refresh). Claude's captions are now cached. Check: the top cards have **Oscar** among the friends. | Anthony |
| 12:40 | Phones: **charged** (or on a battery pack), **Do Not Disturb**, brightness up, **auto-lock off** (Oscar's screen must stay on: the invite banner is in-app, there are no push notifications). | All |
| 12:40 | **Screen mirroring** of Phone 1 to the laptop/projector works (AirPlay/QuickTime for iPhone, scrcpy/Vysor or a USB-C display adapter for Android). Test the venue Wi-Fi; a phone **hotspot** ready as backup. | Anthony |
| 12:45 | Phone 2 (Oscar): app open on the **Feed** tab and left there (that's where the banner pops; other tabs only show a badge on Plans). | Oscar |
| — | Laptop: this runbook open + `docs/engine.md` for the Q&A + a terminal in the repo for the reset. | Anthony |

**Who answers what in Q&A:** Anthony: the feed engine, ranking, learning, Google Calendar. Mhammad: plans, live updates, search, Claude captions. Adel: data (places, events, registry, travel times, weather), database and security. Oscar: design, the app feel (cards, swipes, the breaking bar).

### Between two judges (~1 minute)
1. Phone 1: open the plan you just made → **Cancel plan** (keeps Oscar's phone clean, removes the calendar events).
2. Laptop: `node scripts/demo-reset.mjs` → "Anthony Helou: cleared N learned weights".
3. Phone 1: tap **Feed** (fresh visit, bars are back). Phone 2: back to the **Feed** tab.

## 2. The 5 minutes

| Time | Say | Do (Phone 1 unless noted) | Judges see |
|---|---|---|---|
| **0:00–0:30** Hook | "How many of you said *we should hang out* this week, and didn't? Plans die in the group chat: nobody knows when everyone's free, and nobody wants to pick." | — | — |
| **0:30–0:50** Idea | "Instagram shows you what your friends **did**. Sidequest shows you what you **could do together** this week. Every card answers 3 questions: **what, when, who**." | Open the feed | Full-screen card: place, time slot, friends + travel times, weather, a one-line reason |
| **0:50–1:30** Real data | "These are our **real Google Calendars**: the 4 of us. This slot is free for all of us, with a 15-minute buffer to get there. Travel time is per person. The line at the bottom is written by Claude from the card's facts." Swipe up through 2–3 cards | Scroll | Different days, places, friends |
| **1:30–2:00** Why | "Nothing here is random. Tap *why*:" | Tap **ⓘ Why am I seeing this?** | 7-factor breakdown: interest, friends free, timing, weather, fairness, novelty, proximity |
| **2:00–2:40** Learning | "And it learns. I don't feel like bars this week." Skip the next **2 bars** (✕). The pill "Showing fewer bars · Refresh" appears → tap it | Skip, skip, Refresh | **No bars** in the new feed |
| **2:40–3:30** The loop | "Let's actually go." On a card with Oscar: **swipe the orange bar** → keep Oscar ticked → **Send** | Phone 2 (Oscar) holds up: **"Anthony invited you"** banner, live → tap → **I'm in** | Phone 1 flips to **Confirmed** in under a second. "And it's in our Google Calendars now." |
| **3:30–3:50** Search | "Or just ask." Search: **something cheap with Adel tomorrow night** | Type + enter | Chips "Budget · with Adel · Tomorrow night", all $ places Monday evening with Adel |
| **3:50–4:30** Tech | "Under the hood": see §3 (pick 3 lines) | Swipe to **Plans** (tab swipe) → show Memories / the plan | — |
| **4:30–5:00** Close | "Sidequest gets you **off your phone and out with your friends**: Touch Grass, People First. Next: AI nudges when your friends are free and something great is happening, friend requests, real transit times, more cities. Thank you!" | — | — |

**If time is short:** cut Search (3:30) first, then shorten Tech to one sentence.
**Don't on stage:** skip more than 2–3 cards (it learns!), change postal codes, test weird searches, open the dev tools.

---

## 3. Tech talking points (pick 3, ~10 s each)

- **Feed engine, our own:** for each of the next 7 days it intersects everyone's real calendars on a 30-min grid (+15-min buffer), checks every place against hard rules (open the whole visit, everyone within 35 min, no outdoor place in the rain), then ranks with 7 weighted factors and a fairness rule: the **longest trip in the group** decides, not just mine. About 10,000 possible visits ranked in ~200 ms.
- **It learns from swipes:** every skip/save/go moves per-category and per-tag weights; two skips suppress a category. Visible on the next refresh.
- **Live:** invites and RSVPs push through Supabase Realtime in **under 200 ms** (we measured 3 phones at once).
- **Real data:** Google Calendar (times only, never titles), the city's open data: **~4,000 events** (≈150 fit this week) and a **55,000-business health registry** (search "indian food tonight"), OpenRouteService travel times, Open-Meteo weather.
- **Claude, where it helps, never deciding the ranking:** one batched call writes the card captions (template fallback if slow), and the **Book it** assistant reads a restaurant's official website to find the booking link or "no reservations".
- **Quality:** 626 automated tests; overnight we checked ~1,300 cards for 39 test users against the database: **0 rule violations**. Row-level security on every table.

## 4. Features to mention if asked (each is one tap away)

- **Start a sidequest now** (My plans): picks a place open now + friends free in the next hour.
- **Memories** (My plans → 📸): every photo from your outings, story style. Tap an outing → its plan.
- **Live location** (from 30 min before): "Maya · 8 min away / running late", **never** coordinates.
- **Google Calendar:** I'm in → added; can't make it / cancelled → removed.
- **Book it:** party size, French/English message, booking link or phone.
- **Swipe between tabs**, tap **Feed** again to refresh.

## 5. How it works, one line each (full detail: [`docs/engine.md`](engine.md))

| Concept | One line for a judge |
|---|---|
| **Where places come from** | 60 hand-picked places with verified hours and photos, ~150 city events this week (montreal.ca open data, official pictures), and in search 5,700 registry restaurants + 2,545 OpenStreetMap venues. |
| **How a place is labelled** | category, tags from 15 interests (+ cuisine), price $–$$$$, hours per weekday, visit length, indoor/outdoor. Registry cuisines are guessed from the name; their hours are assumed → "Hours not verified" in the details and on the plan. |
| **Free time** | 30-min slots over the next 7 days (9:00–23:00), from Google Calendar times only, with a 15-min buffer around every class or shift. |
| **Hard rules** | open the whole visit, you're free, at least one friend free the whole visit, everyone within 35 min, no outdoor place if rain > 60 %. |
| **Why one restaurant beats another** | 7 scores: interest 30 %, friends free 20 %, good hour 15 %, weather 10 %, fairness (longest trip in the group) 10 %, novelty 10 %, your own distance 5 %. Example: Ma Poule Mouillée 0.79 beats Beauty's 0.72 on "cheap-eats" (his interest) and being walkable. |
| **Learning** | skip −0.25 on the category, save +0.15, go +0.30; two skips → that category × 0.3 → out of the top 10. |
| **Variety** | curated first, a ±0.07 random shake per visit, −0.15 for places you just saw, no same category in 3 cards in a row, one card per place, up to 3 "also free" times. |
| **Who gets the invite** | only the friends on that card (free for the whole visit, within 35 min), all ticked; the server re-checks they're still free, then signals only the plan's members; their phone refetches and shows the banner in < 1 s. |
| **Confirmed** | as soon as one invitee says I'm in; everyone declines → cancelled; I'm in → Google Calendar event, Can't make it → removed. |
| **Claude** | writes the one-line caption from the card's facts (one batched call, template if slow) and reads restaurant websites for booking. Never ranks. |
| **Search** | plain code: words → filters (budget, friend names, tonight/tomorrow, categories, cuisines), then the same engine. |
| **Privacy** | calendar times only, postal-code area only, opt-in location as status/ETA only, private photos, row-level security on every table. |

## 6. Q&A cheat sheet

| Question | Answer |
|---|---|
| Is the data real? | Yes: our 4 real Google Calendars, real places, real city events. Friends are the 4 of us. |
| How do you know everyone is free? | Google Calendar free/busy at sign-in (event times only, never titles). 15-min buffer around every class/shift. |
| Why not just use a group chat poll? | The poll asks *when*; we answer *when + what + who* before anyone types. |
| What does Claude do? | Writes the one-line reason per card (batched, cached, template fallback) and reads restaurant websites for booking. It never ranks. |
| Privacy? | Calendar times only; location is opt-in, members only, 30 min around the plan, status/ETA only; photos in a private bucket with expiring links; RLS on every table. |
| Transit? | Walking times from OpenRouteService, bike time as a stand-in for metro over 25 min (ORS has no transit). Real transit is next. |
| Only 60 places? | 60 hand-picked with verified hours + photos in the feed, plus this week's city events (~150 of ~4,000); search covers 55,000 registry restaurants (labelled "hours not verified"). |
| What's next? | AI nudges ("you're all free Saturday and there's a market"), friend requests, transit, more cities. |
| Challenges | **Touch Grass** (gets people out together), **People First** (fair for everyone's travel, privacy by design). |

## 7. If something breaks on stage

| Problem | Do |
|---|---|
| Feed slow / empty | Pull up the screen recording; keep talking through the script. |
| Invite banner doesn't show on Phone 2 | Oscar opens **Plans** (the invite is listed there; polling catches up in ~3 s). |
| Bars still show after Refresh | Say "it's suppressed, here's why" → tap **Why** on a bar card (lower match). Then move on. |
| Wi-Fi dies | Hotspot from a phone; worst case the recording. |
| Sign-in problem | Backup world: set `DEMO_MODE=true` on Vercel, then Phone 1 = Sam, Phone 2 = "continue as Maya" (`/api/dev/login-as`). Takes ~2 min to redeploy, so decide before 12:45. |
