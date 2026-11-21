# Demo runbook (Sunday)

> Owner: Anthony. Based on the Part 12 final pass: simulated at demo time (Sun 13:30) on our 4 real accounts.
> Rule: switch modes only by editing `.env.local` / Vercel env vars and restarting, never with command-line overrides.

---

## 1. Setup (≈ 30 min before presenting)

| # | Step | Who |
|---|---|---|
| 1 | Pull `main`, `npm ci`, restart (or confirm the Vercel deploy is the latest `main`) | Anthony |
| 2 | Env for the demo machine/deploy: `USE_MOCK_DATA=false`, `DEMO_MODE=false`, `DEMO_USER_EMAIL=` (empty), **`FORCE_RAIN_DAY=` (empty for now)** | Anthony |
| 3 | **Reset demo state** (wipes plans, interactions and **learned weights**, keeps our accounts + Google calendars): `curl -X POST <url>/api/dev/seed -H "x-seed-secret: <SEED_SECRET>"` | Adel |
| 4 | Everyone signs in once on their phone (re-syncs calendars). Check `/me`: neighbourhood + interests set, 3 friends | All |
| 5 | **Warm Claude captions**: open each phone's feed once, wait ~5 s, pull to refresh. The 2nd load shows Claude captions instantly | All |
| 6 | Check the names on cards say **Oscar / Mohammad / Adel / Anthony** (not an email handle) | Anthony |

**Phones:** Phone 1 = **Anthony** (presenter). Phone 2 = **Oscar** (receives the invite).

---

## 2. Stage script (~2 min)

| # | Say / do | What the judges see | Backed by |
|---|---|---|---|
| 1 | "Plans die in the group chat." | | |
| 2 | Phone 1: open the feed | Cards with **what + when + who**: e.g. *Kazu · Sun 17:30 · Oscar, Mohammad, Adel*, all 4 real calendars respected | Engine, real Google Calendars |
| 3 | Tap the **ⓘ / Why** on the top card | "Why this card?": match %, interest, friends free, timing, weather… | Score breakdown |
| 4 | **Skip Brutopia** and **Le Darling** (the 2 bars), tap **Refresh** | "Showing fewer bars", and **no bars left in the top 10** (verified: 2 → 0) | Swipe learning |
| 5 | Swipe **Let's go** on a card → keep Oscar ticked → Send | Plan page "Waiting for replies" | Invites |
| 6 | Phone 2 (Oscar): the **"Anthony invited you"** banner appears (< 1 s) → open → **I'm in** | Phone 1 flips to **Confirmed** (< 1 s), confetti | Live updates (Broadcast) |
| 7 | Phone 1: search **"something cheap with Adel tomorrow night"** | Budget places, Mon evening, all with Adel | Plain-code search → engine filters |
| 8 | *(optional)* Rain: set **`FORCE_RAIN_DAY=sat`**, refresh | Saturday's **Old Port** and **Lachine Canal** cards disappear (outdoor + rain) | Hard rule: no outdoor in rain |
| 9 | Close: impact + what's next (contacts import, native app, more cities) | | |

**Why `sat` for rain:** on Sunday afternoon there are no outdoor cards to remove, so `sun` changes nothing visible. Saturday afternoon has the outdoor cards.

---

## 3. Backup world (if real calendars / sign-in misbehave on stage)

Set `DEMO_MODE=true` and `DEMO_USER_EMAIL=anthonythehelou@gmail.com`, restart, then:
- Phone 1 = Google sign-in (maps to **Sam**), Phone 2 = login page → **"continue as Maya"**.
- Same script; skip 2 bars, invite Maya, Maya's banner → I'm in.

---

## 4. Known facts for Q&A
- Feed: ~10,500 possible visits checked, ~100–130 ms. 0 calendar conflicts across all 4 real feeds.
- Calendar: event **times only**, never titles; all-day events ignored; "Show as: Free" timetables still count.
- Claude: captions only, from the card's facts; never ranks; template fallback if slow.
- Details: `docs/engine.md`.
