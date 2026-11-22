# Demo runbook: 5-minute presentation (Sun, judging 1:00–3:30 PM)

> Owner: Anthony. Checked Sun 10:15 on a read-only snapshot of production, simulated at demo time (Sun 1:30 PM):
> Anthony's real feed, real calendars, current `main` (variety, walkable preference, 15-min buffer, tab swipes).

**Phones:** Phone 1 = **Anthony** (presenter, mirrored on the screen). Phone 2 = **Oscar** (receives the invite, holds it up).
**Live URL:** https://sidequest-two-smoky.vercel.app

---

## 1. Before judging (do these in order)

| When | Step | Who |
|---|---|---|
| 12:30 | Confirm Vercel shows the latest `main` (the tab bar is frosted, swiping between tabs works) | Anthony |
| 12:40 | Everyone opens the app once and signs in again if asked (re-syncs Google Calendars). On `/me`: home + interests set, 3 friends | All |
| 12:45 | **Reset Anthony's learned weights** (see box below). After this, **Anthony doesn't skip/save anything until the demo** | Anthony + Claude |
| 12:50 | **Warm the captions:** on Phone 1 open the feed, wait ~5 s, scroll 2 cards, tap **Feed** to refresh. Claude captions now show instantly | Anthony |
| 12:50 | Phone 2 (Oscar): open the app on **Feed** and leave it there (that's where the invite banner pops; other tabs only show a badge on Plans) | Oscar |
| 12:55 | Screen mirroring of Phone 1 works, phones charged, brightness up, Do Not Disturb on, Wi-Fi (not eduroam if it's slow; hotspot as backup) | All |
| — | **Backup:** a 1-minute screen recording of the full loop on Phone 1 (record it once at 12:50) | Mohammad |

> **Why the reset matters:** from all our testing, Anthony's account learned to dislike **every** category (all at −0.5 or lower).
> When everything is suppressed, nothing stands out: "skip 2 bars → bars gone" leaves 2 bars in the top 10.
> With the weights cleared, skipping 2 bars leaves **0 bars in the top 10 on 20/20 simulated visits**.
> Reset = delete Anthony's rows in `user_tag_weights` (his swipe history stays). Claude can run it on Anthony's go, or in the
> Supabase SQL editor: `delete from user_tag_weights where user_id = '9dd740c1-…';` (Anthony's full id is in `/me`).

---

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

## 5. Q&A cheat sheet

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

## 6. If something breaks on stage

| Problem | Do |
|---|---|
| Feed slow / empty | Pull up the screen recording; keep talking through the script. |
| Invite banner doesn't show on Phone 2 | Oscar opens **Plans** (the invite is listed there; polling catches up in ~3 s). |
| Bars still show after Refresh | Say "it's suppressed, here's why" → tap **Why** on a bar card (lower match). Then move on. |
| Wi-Fi dies | Hotspot from a phone; worst case the recording. |
| Sign-in problem | Backup world: set `DEMO_MODE=true` on Vercel, then Phone 1 = Sam, Phone 2 = "continue as Maya" (`/api/dev/login-as`). Takes ~2 min to redeploy, so decide before 12:45. |
