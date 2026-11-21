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
  const search = /** @type {any} */ (data).searchRegistry; // lib/data (Adel, N1); absent before the merge
  if (typeof search !== "function") return ctx;
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
    getPlaces(),
    getWeather(range),
    getTagWeights(userId),
    getRecentInteractions(userId, ENGINE.noveltyDays),
  ]);
  if (!me) return null;

  // Round 2: needs the people + places from round 1.
  const userIds = [me.id, ...friends.map((f) => f.user.id)];
  const placeIds = places.map((p) => p.id);
  const [busyBlocks, travelTimes] = await Promise.all([
    getBusyBlocks(userIds, range),
    getTravelTimes(userIds, placeIds),
  ]);

  const ctx = indexContext({ now, me, friends, places, busyBlocks, weather, travelTimes, tagWeights, recentInteractions });
  return addCuisinePlaces(ctx, opts.cuisine);
}
