# How Sidequest decides what to show you

> **For:** the Devpost write-up, the pitch, and answering judges' "how does it pick these?" questions.
> **Owner:** Anthony (feed engine). Every number below comes from the code (`lib/engine/config.js`) or a measured run on our real Supabase data.

---

## 1. The idea in one paragraph

Every card in the feed is **a real place, at a real time, when you and specific friends are all actually free**. Sidequest reads everyone's real calendar, finds the windows where you overlap, keeps only the places that are open, reachable and sensible for that moment, scores them, and shows the best ones with a short reason. Skip a few things and the feed learns. Tap **Let's go** and your friends get the invite.

---

## 2. The pipeline

```
 Google Calendars ─┐
 Places (60) ──────┤
 Weather (hourly) ─┼─▶ 1. Time grid ─▶ 2. Hard rules ─▶ 3. Score ─▶ 4. Variety ─▶ 5. Cards ─▶ 6. Caption
 Travel times ─────┤     (30-min       (never          (7 factors,  (1 per place,   (what + when   (Claude, or
 Your swipes ──────┘      slots)        broken)         0–100 %)     mixed types     + who)         a template)
                                                                    and days)
```

All of steps 1–5 are **plain, deterministic code** (no AI). It runs in about **110–130 ms** on our real data, checking roughly **10,500 possible visits** per feed load.

---

## 3. Step 1: the time grid

Instead of juggling calendar intervals, we cut the next **7 days** into **30-minute slots** between **09:00 and 23:00** (Montréal time), starting no sooner than **1 hour from now**. For each slot we know:

- who is **free** (a slot counts as busy if *any* event touches it, which keeps it conservative),
- whether each place is **open**,
- the **weather** forecast for that hour.

A "visit" is a run of consecutive slots long enough for the place (at least **60 minutes**, longer for museums, bars, etc.). It never spans two days.

---

## 4. Step 2: hard rules (never broken)

A visit is thrown out if any of these fail:

| Rule | Detail |
|---|---|
| **Open the whole time** | The place must be open for every slot of the visit (handles split lunch/dinner hours and bars closing after midnight). Missing hours = closed. We never guess hours. |
| **You are free the whole time** | Based on your real Google Calendar. |
| **At least one friend is free the whole time** | Sidequest is about doing things *together*. |
| **Nobody travels more than 35 minutes** | You must be within 35 min; friends further than that are simply not included on that card. |
| **No outdoor places in the rain** | If the chance of rain goes above **60 %** during the visit, parks and viewpoints are dropped (indoor places stay). |
| **Search filters** | If you searched (e.g. *"something cheap with Maya tomorrow night"*): price cap, required friends, time range (the **whole visit** must fit inside it), categories, indoor-only. |

Missing data is never invented: no travel time for someone = they can't come; no weather for an hour = that visit is skipped.

---

## 5. Step 3: scoring (the "match %")

Every surviving visit gets seven scores between 0 and 1, combined with fixed weights. This is exactly what the **"Why am I seeing this?"** sheet shows.

| Factor | Weight | In one sentence |
|---|---|---|
| **Interest** | 30 % | How well the place's tags (coffee, live-music, views…) match your chosen interests **and** what you've learned from your swipes. |
| **Friends** | 20 % | The share of your friends (weighted by closeness) who are free. The whole group free = 100 %. |
| **Timing** | 15 % | Is this a good time for this kind of place? Restaurants at lunch/dinner, cafés in the morning/afternoon, bars after 20:00, viewpoints near sunset, parks midday. |
| **Weather** | 10 % | Indoor places score steady (and better when it's raining). Outdoor places score higher when it's warm and dry. |
| **Fairness** | 10 % | Based on the **longest** trip in the group, so nobody gets stuck with a 35-minute trek while everyone else walks 5. |
| **Novelty** | 10 % | Places you haven't interacted with recently score higher; places you just skipped score low. |
| **Proximity** | 5 % | Closer to you is a little better. |

---

## 6. Step 4: learning from your swipes

Every **Skip / Save / Let's go** updates your personal taste profile:

- **Skip** lowers that place's **category** (e.g. "bar") by a full step and its tags by a shared step.
  Two skips of bars → the whole category is **pushed down hard** (score × 0.3), so bars disappear from your top 10. The demo shows this live.
- **Save** and **Let's go** raise them (Let's go counts double).
- Skipping one bar that also serves coffee barely touches "coffee", so the feed learns *"not bars"*, not *"not coffee"*.

---

## 7. Step 5: variety

- **One card per place**, ever.
- Each place offers its **best time on up to 2 different days**; the feed avoids putting the same **day** or the same **category** on back-to-back cards (no "bar, bar, bar").
- Result on real data: the top 10 mixes 4–5 categories over 3–4 days, and 9/10 cards have the **whole group** free.

---

## 8. Real calendars, privately

- You sign in with **Google**. At that moment Google gives us a short-lived token.
- We read **only the start and end times** of events in the calendars you've ticked. **We never request titles, locations, descriptions or other attendees.**
- All-day events (holidays, birthdays) are ignored. Events you declined or that were cancelled are ignored.
- Timetables marked "Show as: Free" still count as busy (imported class schedules often are).
- Verified live: a real McGill timetable (28 classes over 2 weeks) synced exactly.

---

## 9. Where AI is used (and where it isn't)

| | AI? |
|---|---|
| Finding free time, checking hours/travel/weather, scoring, learning, variety | **No.** Deterministic code, fully tested. |
| **Card captions** (*"Lunch at Arepera du Plateau Sunday noon, with Karim, Antoine and Léa"*) | **Yes, Claude** (`claude-haiku-5-5`), but only from the card's own facts. It never ranks, never sees calendars, never invents prices or events. If Claude is slow (> 2.5 s) or unavailable, a template caption is shown instantly. |
| **Search** (*"something cheap with Maya tomorrow night"*) | **No.** Plain code with agreed word lists turns your words into filters (*cheap* → budget, a friend's name → must be free, *tomorrow night* → 18:00–23:00), then the engine above does the actual finding. Instant, free, and it can't misread a request into something you didn't say; unknown words simply add no filter. |

---

## 10. Numbers for the pitch

| | |
|---|---|
| Places | 60 curated Montréal spots (restaurants 11, activities 12, bars 10, cafés 9, parks 9, viewpoints 9; 42 indoor) |
| Possible visits checked per feed | ~10,500 |
| Feed build time | ~110–130 ms |
| Score factors | 7 |
| Automated tests | 274 (including deliberately planted bugs to prove the tests catch them) |
| Calendar sync | real Google Calendar, event times only |

---

## 11. Honest limits (good to say before a judge does)

- **Travel times** use walking/cycling routes (OpenRouteService has no public transit), with a straight-line estimate marked "~" when a route is missing.
- **Demo-sized dataset**: 60 hand-curated places, not all of Montréal.
- **Calendar re-syncs at each sign-in**, not continuously.
- **Weather** is a real hourly forecast; for the demo we can stage a rainy afternoon to show the rain rule.
