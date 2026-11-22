/**
 * Part 1: context loader. The ONLY file in lib/engine that does I/O. Owner: Anthony.
 *
 * SERVER-ONLY: imported by route handlers (app/api/feed, app/api/search), never by a
 * "use client" file. It reaches lib/data, which uses the service-role client.
 *
 * Security: Adel's data layer reads with the admin client and does NOT check friendships
 * (it filters only by the ids it's given). So the id list here is built ONLY from the
 * signed-in user + getFriends(user). Never pass ids that came from a request.
 *
 * Missing travel pairs are NOT filled in here (Adel guarantees one row per pair). The
 * candidate step treats a missing pair as "can't reach", so nothing is ever invented.
 * Exception (N1): registry restaurants from a cuisine search have no rows at all; they get
 * straight-line estimates, flagged isEstimate: true ("~" on the card).
 */
import {
  getBusyBlocks,
  getFriends,
  getPlaces,
  getRecentInteractions,
  getTagWeights,
  getTravelTimes,
  getUser,
  getWeather,
} from "@/lib/data";
import * as data from "@/lib/data";
import { toIsoUtc } from "@/lib/time";
import { ENGINE } from "./config";
import { indexContext, withExtraPlaces } from "./context";

/**
 * N1: add registry restaurants of `cuisine` near the user (Adel's searchRegistry), with straight-line
 * travel estimates. Never throws: unknown cuisine / registry down → the curated places only.
 * Use after loadContext() when the filters are known later (e.g. /api/search parses in parallel).
 * @param {import("./context").EngineContext | null} ctx
 * @param {string | undefined} cuisine   a lib/cuisines.js id
 * @returns {Promise<import("./context").EngineContext | null>}
 */
export async function addCuisinePlaces(ctx, cuisine) {
  if (!ctx || !cuisine) return ctx;
  const search = optionalData("searchRegistry"); // lib/data (Adel, N1)
  if (!search) return ctx;
  try {
    const found = await search({ cuisine, near: { lat: ctx.me.homeLat, lng: ctx.me.homeLng } });
    return withExtraPlaces(ctx, found);
  } catch (err) {
    console.warn(`[engine] registry search for "${cuisine}" failed, curated places only:`, err instanceof Error ? err.message : err);
    return ctx;
  }
}

/**
 * Time range the engine looks at: now → end of the horizon (+1 day so the last evening is covered).
 * @param {import("luxon").DateTime} now
 * @returns {import("@/types/domain").TimeRangeT}
 */
export function horizonRange(now) {
  return { start: toIsoUtc(now), end: toIsoUtc(now.plus({ days: ENGINE.horizonDays + 1 }).startOf("day")) };
}

/**
 * Range for events: EXACTLY the feed's days (now → midnight starting day `horizonDays`), one date per
 * weekday. Events carry their time as per-weekday `hours`, so an event 7 days out (same weekday as today)
 * or an exhibition starting mid-week must not leak onto an earlier day with the same weekday.
 * @param {import("luxon").DateTime} now
 * @returns {import("@/types/domain").TimeRangeT}
 */
export function eventsRange(now) {
  return { start: toIsoUtc(now), end: toIsoUtc(now.startOf("day").plus({ days: ENGINE.horizonDays })) };
}

/**
 * Fetch and index everything buildFeed() needs, in two parallel rounds.
 * @param {string} userId   from getSessionUserId(), never from the request
 * @param {import("luxon").DateTime} now   Montréal time; the route passes nowLocal()
 * @param {{ cuisine?: string }} [opts]   N1: also add registry restaurants of this cuisine
 * @returns {Promise<import("./context").EngineContext | null>}  null = unknown user (route → 404)
 */
export async function loadContext(userId, now, opts = {}) {
  const range = horizonRange(now);

  // Round 1: nothing here depends on anything else.
  const [me, friends, places, weather, tagWeights, recentInteractions] = await Promise.all([
    getUser(userId),
    getFriends(userId),
    cachedPlaces(),
    getWeather(range),
    getTagWeights(userId),
    getRecentInteractions(userId, ENGINE.noveltyDays),
  ]);
  if (!me) return null;

  // Round 2: needs the people + places from round 1 (events need my home).
  const userIds = [me.id, ...friends.map((f) => f.user.id)];
  const placeIds = places.map((p) => p.id);
  const [busyBlocks, travelTimes, events] = await Promise.all([
    getBusyBlocks(userIds, range),
    getTravelTimes(userIds, placeIds),
    loadEvents(eventsRange(now), { lat: me.homeLat, lng: me.homeLng }),
  ]);

  const base = indexContext({ now, me, friends, places, busyBlocks, weather, travelTimes, tagWeights, recentInteractions });
  // Events have no travel_times rows: straight-line estimates, like registry places ("~").
  const ctx = events.length > 0 ? withExtraPlaces(base, events) : base;
  return addCuisinePlaces(ctx, opts.cuisine);
}

/** G6c: the curated places are the same for everyone and change only on a reseed: keep them 5 min. */
const PLACES_TTL_MS = 5 * 60_000;
/** @type {{ at: number, value: Promise<import("@/types/domain").PlaceT[]> } | null} */
let placesCache = null;

/**
 * getPlaces() with a 5-minute in-memory cache (per server instance). A failed read is never cached.
 * Per-user data (busy blocks, tag weights, interactions) is NOT cached, so learning stays instant.
 * @param {number} [now]
 */
export function cachedPlaces(now = Date.now()) {
  if (placesCache && now - placesCache.at < PLACES_TTL_MS) return placesCache.value;
  const value = getPlaces();
  placesCache = { at: now, value };
  value.catch(() => {
    if (placesCache?.value === value) placesCache = null;
  });
  return value;
}

/** Tests only: forget the cached places. */
export function resetPlacesCache() {
  placesCache = null;
}

/**
 * A lib/data function that may not exist yet (a teammate's branch not merged), or undefined.
 * Reading it can throw (e.g. a test's module mock without it), so the read itself is guarded.
 * @param {string} name
 * @returns {((...args: any[]) => any) | undefined}
 */
function optionalData(name) {
  try {
    const fn = /** @type {any} */ (data)[name];
    return typeof fn === "function" ? fn : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Montréal open-data events near the user (Adel's getEvents): Places with category "event",
 * source "event", hours = the event's own window, startsAt + eventUrl. Never throws: no events
 * (function not merged yet, Supabase down) → the feed simply has none.
 * @param {import("@/types/domain").TimeRangeT} range
 * @param {{ lat: number, lng: number }} near
 * @returns {Promise<import("@/types/domain").PlaceT[]>}
 */
async function loadEvents(range, near) {
  const getEvents = optionalData("getEvents"); // lib/data (Adel, events); absent before the merge
  if (!getEvents) return [];
  try {
    const found = await getEvents(range, near);
    return Array.isArray(found) ? found : [];
  } catch (err) {
    console.warn("[engine] events skipped:", err instanceof Error ? err.message : err);
    return [];
  }
}
