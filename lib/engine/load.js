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
import { toIsoUtc } from "@/lib/time";
import { ENGINE } from "./config";
import { indexContext } from "./context";

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
 * @returns {Promise<import("./context").EngineContext | null>}  null = unknown user (route → 404)
 */
export async function loadContext(userId, now) {
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

  return indexContext({ now, me, friends, places, busyBlocks, weather, travelTimes, tagWeights, recentInteractions });
}
