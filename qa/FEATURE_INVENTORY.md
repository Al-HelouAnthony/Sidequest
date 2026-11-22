# Feature inventory (from the code at `qa-baseline` = `f1b8723`)

Status column is filled in by the QA run (see `QA_REPORT.md` for details). ✅ pass · ⚠️ pass with findings · ❌ fail · — not tested.

## Pages (all behind the proxy login guard unless noted)
| Route | What | States |
|---|---|---|
| `/` | redirects to `/feed` | — |
| `/login` (public) | Google sign-in card (`LoginCard.jsx`), error message from `?error=` | default, error |
| `/onboarding` | 3 steps: calendar (sync / "sample schedule"), home (postal code / neighbourhood), interests (≥ MIN), friends | each step, saving, error |
| `/feed` | snap-scroll FeedCards, Skip/Save/Swipe-to-go, Why sheet, Place sheet, Weather sheet, Search sheet + summary chip, Refresh pill after skips, invite banner, `?with=` friend filter, endless paging (N3), scroll kept across tabs | loading, error, empty, search-empty, all-caught-up, load-more failed |
| `/plans` | My plans: Invites / Confirmed / Waiting, "Start a sidequest now", 📸 Memories link | loading, error, empty |
| `/plans/[id]` | Plan screen: RSVP, status, members, Book it sheet (+ assistant), Google Calendar badge, Live location (−30/+30 min), Memory photos (−15 min/+12 h), alternatives, cancel | pending, confirmed, cancelled, not-member (403), not found |
| `/plans/preview` | static "How it works" (sample data) | — |
| `/memories` | stories row + month/outing grids + story viewer | loading, error, empty |
| `/friends` | friends list, add/remove, @username / name search, "ideas with X" | loading, empty, search-empty |
| `/me` | profile (@username), postal code, interests, Sign out, links, data credits | loading, error, saving, saved |

## API routes
| Method · route | Input (Zod) | Output | Auth |
|---|---|---|---|
| GET `/api/feed` | query: cursor, filters (FeedFilters JSON), seed, seen | FeedResponse | session |
| POST `/api/interactions` | InteractionRequest | OkResponse | session |
| POST `/api/search` | SearchRequest (≤300 chars) | SearchResponse | session |
| GET/POST `/api/plans` | CreatePlanRequest | PlansResponse / PlanResponse 201 | session |
| POST `/api/plans/now` | — | PlanResponse 201 / 409 | session |
| GET `/api/plans/[id]` | — | PlanResponse | member |
| POST `/api/plans/[id]/rsvp` | RsvpRequest | PlanResponse | invitee |
| POST `/api/plans/[id]/cancel` | — | PlanResponse | creator |
| GET/POST `/api/plans/[id]/booking` | — | BookingInfo / PlanResponse | member / creator+confirmed |
| GET `/api/plans/[id]/booking/agent` | — | BookingAgentResult (Claude + cache) | member |
| POST `/api/plans/[id]/location` | LocationRequest | OkResponse | member, time window, rate limit |
| GET `/api/plans/[id]/locations` | — | PlanLocationsResponse (no coordinates) | member |
| GET/POST `/api/plans/[id]/photos` | multipart `photo` | PlanPhotosResponse | member, time window, type/size |
| GET `/api/memories` | — | MemoriesResponse | session (own plans) |
| GET/POST `/api/friends`, DELETE `/api/friends/[id]` | AddFriendRequest | FriendsResponse / OkResponse | session |
| GET `/api/users?q=` | q ≤ 30 | UsersResponse | session |
| GET/PATCH `/api/me` | UpdateMeRequest | MeResponse | session |
| POST `/api/calendar/sync` | — | CalendarSyncResponse / 501 | session |
| GET `/api/dev/login-as` | id, next | redirect + cookie | **DEMO_MODE only** (404 otherwise) |
| POST `/api/dev/seed` | header x-seed-secret | summary | DEMO_MODE **and** secret |
| POST `/api/dev/seed/places` | header x-seed-secret | summary | secret only (non-destructive) |
| GET `/auth/callback`, POST `/auth/signout` | code, next (safeNextPath) | redirect | public / session |

Proxy (`proxy.js` + `lib/routeGuard.js`): real mode → no session = pages redirect to `/login?next=`, APIs 401; session without a users row → signed out. Demo mode → only session refresh.

## Database (local copy = migrations 0001–0008 + imports)
Tables: users, friendships, busy_blocks, places, travel_times, interactions, user_tag_weights, plans, plan_members, google_tokens, plan_locations, plan_photos, events, businesses. **RLS on for all 14.**
Policies: own-row CRUD on busy_blocks / user_tag_weights / friendships (insert/update/delete own), interactions (insert/select own), users (insert/update self, select self or friends), busy_blocks (select own or friends), travel_times (select own), plans / plan_members (select if `is_plan_member`, SECURITY DEFINER), places (select all, anon too), events (select authenticated). google_tokens, plan_locations, plan_photos, businesses: **no policies** (server/service-role only).
Indexes: busy_blocks(user_id,start_at), friendships(friend_id) + PK, travel_times PK(user,place,mode) + (place_id), interactions(user_id,created_at) + (place_id), plans(creator_id), (place_id), plan_members PK(plan,user) + (user_id), plan_photos(plan_id,created_at), events(start_at), (dates), (place_key), businesses trigram(name) + partial geo + (type,statut).
Function: `is_plan_member(uuid)`. Storage buckets: `place-photos` (public), `plan-photos` (private).

## Realtime
Supabase **Broadcast** (no Postgres Changes): `plan:<id>` and `user:<id>:invites`, event `plan-changed`, **no data in the payload**; clients refetch through the API. Sent by `lib/social/realtime.js`, received by `lib/social/live.js` (`usePlan`, `useInvites`), with polling as a fallback.

## External integrations
| Service | Where | Fallback |
|---|---|---|
| Claude (Anthropic SDK) | captions (`lib/ai/captions.js`, batched, 800 ms budget + `after()`), booking assistant (`lib/booking/`), search: **plain word lists, not Claude** (`lib/ai/search.js`) | template captions |
| Google OAuth + Calendar | sign-in, freeBusy at callback, `calendar.events` insert/delete (`lib/calendar/`) | seeded schedules; skip users without a token |
| OpenRouteService | travel times in the seed (`lib/data/travel.js`) | haversine, `is_estimate` |
| Open-Meteo | hourly weather (`lib/data/weather.js`), 30 min cache, `FORCE_RAIN_*` | neutral weather |
| montreal.ca open data | events (import + JSON-LD times/images), businesses registry | svg placeholder |
| OSM venues | `data/` bundled JSON (`lib/data/venues.js`) | — |
| Supabase Storage | place photos (now bundled `/places/<id>.jpg`), private plan photos (signed URLs 1 h) | — |

## Scripts
`/api/dev/seed` (reset demo world), `/api/dev/seed/places`, `supabase/import/*` (businesses, events + `fetch_event_times.mjs`), QA: `scripts/qa-*.mjs`.

## In the QA prompt or plan but NOT built
- **Ticketmaster, Google Places, `/api/photo`**: dropped by the team (montreal.ca events + bundled photos instead).
- **NL search with Claude**: replaced by plain word lists (PLAN §0, B4–B5).
- **Map view, group mode, add-to-calendar `.ics`** (stretch): not built (Google Calendar insert covers "add to calendar").
- **Push notifications**: none (in-app banners + polling/Broadcast only).
- **Friend requests / acceptance**: adding a friend is one-sided and immediate (see security findings).
