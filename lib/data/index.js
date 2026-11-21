/**
 * DATA ACCESS CONTRACT. Owner: Adel.
 *
 * The engine (Anthony) and API routes ONLY get data through these functions.
 * USE_MOCK_DATA=true (default): every function returns mock data (demo safety switch).
 * USE_MOCK_DATA=false: Supabase (lib/data/db.js) + Open-Meteo (lib/data/weather.js).
 * Travel times are precomputed with OpenRouteService by the seed (POST /api/dev/seed).
 * Both modes keep the same names, arguments and return shapes.
 * Server-only module: never import from a "use client" file.
 *
 * Shapes are documented with JSDoc typedefs from types/ (hover them in VS Code).
 */
import { mockFriendships, mockUsers } from "@/lib/mocks/users";
import { mockPlaces } from "@/lib/mocks/places";
import { buildMockBusyBlocks } from "@/lib/mocks/schedules";
import { buildMockWeather } from "@/lib/mocks/weather";
import * as db from "./db";
import { estimateTravelMin, haversineKm } from "./geo";
import { getRealWeather } from "./weather";

/** @typedef {import("@/types/domain").UserT} UserT */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").TimeRangeT} TimeRangeT */
/** @typedef {import("@/types/domain").InteractionT} InteractionT */
/** @typedef {import("@/types/domain").TagWeightsT} TagWeightsT */

export const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== "false";

// In-memory stores for mock mode. globalThis survives dev hot reloads.
// NOTE: on Vercel each serverless instance has its own memory, so mock writes are not shared.
/** @type {{ interactions: InteractionT[], tagWeights: Map<string, TagWeightsT> }} */
const mem = (globalThis.__sqData ??= { interactions: [], tagWeights: new Map() });

/** @param {string} aStart @param {string} aEnd @param {TimeRangeT} r */
const overlaps = (aStart, aEnd, r) => Date.parse(aStart) < Date.parse(r.end) && Date.parse(aEnd) > Date.parse(r.start);

/** @param {string} userId @returns {Promise<UserT | null>} */
export async function getUser(userId) {
  if (!USE_MOCK_DATA) return db.getUser(userId);
  return mockUsers.find((u) => u.id === userId) ?? null;
}

/** @param {string[]} userIds @returns {Promise<UserT[]>} */
export async function getUsers(userIds) {
  if (!USE_MOCK_DATA) return db.getUsers(userIds);
  return mockUsers.filter((u) => userIds.includes(u.id));
}

/** All users (for "add friends" in onboarding). @returns {Promise<UserT[]>} */
export async function listUsers() {
  if (!USE_MOCK_DATA) return db.listUsers();
  return mockUsers;
}

/** @param {string} userId @returns {Promise<{ user: UserT, closeness: number }[]>} */
export async function getFriends(userId) {
  if (!USE_MOCK_DATA) return db.getFriends(userId);
  return mockFriendships
    .filter((f) => f.userId === userId)
    .flatMap((f) => {
      const user = mockUsers.find((u) => u.id === f.friendId);
      return user ? [{ user, closeness: f.closeness }] : [];
    });
}

/** @returns {Promise<PlaceT[]>} */
export async function getPlaces() {
  if (!USE_MOCK_DATA) return db.getPlaces();
  return mockPlaces;
}

/** @param {string} placeId @returns {Promise<PlaceT | null>} */
export async function getPlace(placeId) {
  if (!USE_MOCK_DATA) return db.getPlace(placeId);
  return mockPlaces.find((p) => p.id === placeId) ?? null;
}

/**
 * Busy blocks for these users that overlap `range`.
 * @param {string[]} userIds @param {TimeRangeT} range
 * @returns {Promise<import("@/types/domain").BusyBlockT[]>}
 */
export async function getBusyBlocks(userIds, range) {
  if (!USE_MOCK_DATA) return db.getBusyBlocks(userIds, range);
  return buildMockBusyBlocks(8).filter((b) => userIds.includes(b.userId) && overlaps(b.startAt, b.endAt, range));
}

/**
 * Hourly weather for Montréal covering `range`.
 * @param {TimeRangeT} range
 * @returns {Promise<import("@/types/domain").HourlyWeatherT[]>}
 */
export async function getWeather(range) {
  if (!USE_MOCK_DATA) return getRealWeather(range);
  return buildMockWeather(8).filter((w) =>
    overlaps(w.time, new Date(Date.parse(w.time) + 3_600_000).toISOString(), range),
  );
}

/**
 * One row per (user, place). Real version: seeded ORS rows, haversine fallback for missing pairs.
 * @param {string[]} userIds @param {string[]} placeIds
 * @returns {Promise<import("@/types/domain").TravelTimeT[]>}
 */
export async function getTravelTimes(userIds, placeIds) {
  if (!USE_MOCK_DATA) return db.getTravelTimes(userIds, placeIds);
  const users = mockUsers.filter((u) => userIds.includes(u.id));
  const places = mockPlaces.filter((p) => placeIds.includes(p.id));
  return users.flatMap((u) =>
    places.map((p) => ({
      userId: u.id,
      placeId: p.id,
      minutes: estimateTravelMin(haversineKm(u.homeLat, u.homeLng, p.lat, p.lng)),
      mode: /** @type {const} */ ("foot-walking"),
      isEstimate: true,
    })),
  );
}

/** @param {string} userId @returns {Promise<TagWeightsT>} */
export async function getTagWeights(userId) {
  if (!USE_MOCK_DATA) return db.getTagWeights(userId);
  return mem.tagWeights.get(userId) ?? {};
}

/** @param {string} userId @param {TagWeightsT} weights @returns {Promise<void>} */
export async function setTagWeights(userId, weights) {
  if (!USE_MOCK_DATA) return db.setTagWeights(userId, weights);
  mem.tagWeights.set(userId, weights);
}

/**
 * @param {string} userId
 * @param {{ placeId: string, slotStart: string, action: "skip" | "save" | "go" }} input
 * @returns {Promise<InteractionT>}
 */
export async function recordInteraction(userId, input) {
  if (!USE_MOCK_DATA) return db.recordInteraction(userId, input);
  const row = { ...input, userId, createdAt: new Date().toISOString() };
  mem.interactions.push(row);
  return row;
}

/**
 * For novelty scoring: what the user has interacted with recently.
 * @param {string} userId @param {number} [sinceDays]
 * @returns {Promise<InteractionT[]>}
 */
export async function getRecentInteractions(userId, sinceDays = 14) {
  if (!USE_MOCK_DATA) return db.getRecentInteractions(userId, sinceDays);
  const since = Date.now() - sinceDays * 86_400_000;
  return mem.interactions.filter((i) => i.userId === userId && Date.parse(i.createdAt) >= since);
}
