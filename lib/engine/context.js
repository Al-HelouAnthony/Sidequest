/**
 * The engine's input: one object holding everything buildFeed() needs, already indexed.
 * Pure: no I/O. Built by lib/engine/load.js (real) and lib/engine/fixtures.js (tests),
 * so both always produce exactly the same shape. Owner: Anthony.
 */

import { estimateTravelMin, haversineKm } from "@/lib/data/geo"; // pure math, no I/O

/** @typedef {import("@/types/domain").UserT} UserT */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").BusyBlockT} BusyBlockT */
/** @typedef {import("@/types/domain").HourlyWeatherT} HourlyWeatherT */
/** @typedef {import("@/types/domain").TravelTimeT} TravelTimeT */
/** @typedef {import("@/types/domain").TagWeightsT} TagWeightsT */
/** @typedef {import("@/types/domain").InteractionT} InteractionT */

/**
 * @typedef {object} EngineContext
 * @property {import("luxon").DateTime} now        Injected "current time" (never read the clock inside lib/engine).
 * @property {UserT} me
 * @property {{ user: UserT, closeness: number }[]} friends
 * @property {PlaceT[]} places
 * @property {Map<string, BusyBlockT[]>} busyByUser          userId → blocks (every user in ctx has an entry, maybe [])
 * @property {Map<string, HourlyWeatherT>} weatherByHour     hour start as epoch ms (string) → weather
 * @property {Map<string, TravelTimeT>} travel               `${userId}:${placeId}` → travel time
 * @property {TagWeightsT} tagWeights
 * @property {InteractionT[]} recentInteractions
 */

/** Key for ctx.travel. @param {string} userId @param {string} placeId */
export const travelKey = (userId, placeId) => `${userId}:${placeId}`;

/**
 * N1: add places that have no travel_times rows (registry restaurants from a cuisine search).
 * Each person in ctx gets a straight-line estimate to each new place (isEstimate: true → "~" on the card).
 * Places already in ctx are skipped (curated always wins). Pure: returns a new ctx.
 * @param {EngineContext} ctx
 * @param {PlaceT[]} extra
 * @returns {EngineContext}
 */
export function withExtraPlaces(ctx, extra) {
  const known = new Set(ctx.places.map((p) => p.id));
  const added = extra.filter((p) => !known.has(p.id) && (known.add(p.id), true));
  if (!added.length) return ctx;
  const travel = new Map(ctx.travel);
  for (const u of [ctx.me, ...ctx.friends.map((f) => f.user)]) {
    for (const p of added) {
      const key = travelKey(u.id, p.id);
      if (travel.has(key)) continue;
      const minutes = estimateTravelMin(haversineKm(u.homeLat, u.homeLng, p.lat, p.lng));
      travel.set(key, { userId: u.id, placeId: p.id, minutes, mode: "foot-walking", isEstimate: true });
    }
  }
  return { ...ctx, places: [...ctx.places, ...added], travel };
}

/** Key for ctx.weatherByHour: the hour's start in epoch ms. @param {number} ms */
export const hourKey = (ms) => String(Math.floor(ms / 3_600_000) * 3_600_000);

/**
 * Turn raw data-layer results into an EngineContext.
 * @param {{
 *   now: import("luxon").DateTime, me: UserT, friends: { user: UserT, closeness: number }[],
 *   places: PlaceT[], busyBlocks: BusyBlockT[], weather: HourlyWeatherT[], travelTimes: TravelTimeT[],
 *   tagWeights: TagWeightsT, recentInteractions: InteractionT[],
 * }} raw
 * @returns {EngineContext}
 */
export function indexContext(raw) {
  const busyByUser = new Map([raw.me, ...raw.friends.map((f) => f.user)].map((u) => [u.id, []]));
  for (const b of raw.busyBlocks) busyByUser.get(b.userId)?.push(b);

  const weatherByHour = new Map(raw.weather.map((w) => [hourKey(Date.parse(w.time)), w]));
  const travel = new Map(raw.travelTimes.map((t) => [travelKey(t.userId, t.placeId), t]));

  return {
    now: raw.now,
    me: raw.me,
    friends: raw.friends,
    places: raw.places,
    busyByUser,
    weatherByHour,
    travel,
    tagWeights: raw.tagWeights,
    recentInteractions: raw.recentInteractions,
  };
}
