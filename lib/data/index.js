/**
 * DATA ACCESS CONTRACT. Owner: Adel.
 *
 * The engine (Anthony) and API routes ONLY get data through these functions.
 * USE_MOCK_DATA=true (default): every function returns mock data (demo safety switch).
 * USE_MOCK_DATA=false: Supabase (lib/data/db.js) + Open-Meteo (lib/data/weather.js).
 *   If a Supabase call fails (network down, bad key, ...), the function logs a loud
 *   "[lib/data] ... falling back to mock data" error and returns the mock version instead,
 *   so the demo keeps working. Set DATA_FALLBACK=false to make those failures throw instead.
 * Travel times are precomputed with OpenRouteService by the seed (POST /api/dev/seed).
 * Both modes keep the same names, arguments and return shapes.
 * FORCE_RAIN_DAY=<mon..sun|today> stages rain 13:00–18:00 that day, in both modes.
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
import { applyRainyDay, forcedRainDay, getRealWeather } from "./weather";

/** @typedef {import("@/types/domain").UserT} UserT */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").TimeRangeT} TimeRangeT */
/** @typedef {import("@/types/domain").InteractionT} InteractionT */
/** @typedef {import("@/types/domain").TagWeightsT} TagWeightsT */

export const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== "false";
/** On a Supabase failure: true (default) = log + use mocks, false = throw. */
export const DATA_FALLBACK = process.env.DATA_FALLBACK !== "false";

// In-memory stores for mock mode. globalThis survives dev hot reloads.
// NOTE: on Vercel each serverless instance has its own memory, so mock writes are not shared.
/** @type {{ interactions: InteractionT[], tagWeights: Map<string, TagWeightsT> }} */
const mem = (globalThis.__sqData ??= { interactions: [], tagWeights: new Map() });

/** @param {string} aStart @param {string} aEnd @param {TimeRangeT} r */
const overlaps = (aStart, aEnd, r) => Date.parse(aStart) < Date.parse(r.end) && Date.parse(aEnd) > Date.parse(r.start);

/**
 * Run the Supabase version; on failure, log loudly and run the mock version (unless DATA_FALLBACK=false).
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} real
 * @param {() => Promise<T>} fallback
 * @returns {Promise<T>}
 */
async function withFallback(name, real, fallback) {
  try {
    return await real();
  } catch (err) {
    if (!DATA_FALLBACK) throw err;
    console.error(`[lib/data] ${name} failed on Supabase, falling back to mock data: ${err instanceof Error ? err.message : err}`);
    return fallback();
  }
}

// --- mock implementations (USE_MOCK_DATA=true, and the fallback target) ------

const mock = {
  /** @param {string} userId */
  getUser: async (userId) => mockUsers.find((u) => u.id === userId) ?? null,
  /** @param {string[]} userIds */
  getUsers: async (userIds) => mockUsers.filter((u) => userIds.includes(u.id)),
  listUsers: async () => mockUsers,
  /** @param {string} userId */
  getFriends: async (userId) =>
    mockFriendships
      .filter((f) => f.userId === userId)
      .flatMap((f) => {
        const user = mockUsers.find((u) => u.id === f.friendId);
        return user ? [{ user, closeness: f.closeness }] : [];
      }),
  getPlaces: async () => mockPlaces,
  /** @param {string} placeId */
  getPlace: async (placeId) => mockPlaces.find((p) => p.id === placeId) ?? null,
  /** @param {string[]} userIds @param {TimeRangeT} range */
  getBusyBlocks: async (userIds, range) =>
    buildMockBusyBlocks(8).filter((b) => userIds.includes(b.userId) && overlaps(b.startAt, b.endAt, range)),
  /** @param {TimeRangeT} range */
  getWeather: async (range) => {
    const hours = buildMockWeather(8).filter((w) => overlaps(w.time, new Date(Date.parse(w.time) + 3_600_000).toISOString(), range));
    const day = forcedRainDay();
    return day ? applyRainyDay(hours, day) : hours;
  },
  /** @param {string[]} userIds @param {string[]} placeIds */
  getTravelTimes: async (userIds, placeIds) => {
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
  },
  /** @param {string} userId */
  getTagWeights: async (userId) => mem.tagWeights.get(userId) ?? {},
  /** @param {string} userId @param {TagWeightsT} weights */
  setTagWeights: async (userId, weights) => {
    mem.tagWeights.set(userId, weights);
  },
  /** @param {string} userId @param {{ placeId: string, slotStart: string, action: "skip" | "save" | "go" }} input */
  recordInteraction: async (userId, input) => {
    const row = { ...input, userId, createdAt: new Date().toISOString() };
    mem.interactions.push(row);
    return row;
  },
  /** @param {string} userId @param {number} sinceDays */
  getRecentInteractions: async (userId, sinceDays) => {
    const since = Date.now() - sinceDays * 86_400_000;
    return mem.interactions.filter((i) => i.userId === userId && Date.parse(i.createdAt) >= since);
  },
};

// --- the contract -------------------------------------------------------------

/** @param {string} userId @returns {Promise<UserT | null>} */
export async function getUser(userId) {
  if (USE_MOCK_DATA) return mock.getUser(userId);
  return withFallback("getUser", () => db.getUser(userId), () => mock.getUser(userId));
}

/** @param {string[]} userIds @returns {Promise<UserT[]>} */
export async function getUsers(userIds) {
  if (USE_MOCK_DATA) return mock.getUsers(userIds);
  return withFallback("getUsers", () => db.getUsers(userIds), () => mock.getUsers(userIds));
}

/** All users (for "add friends" in onboarding). @returns {Promise<UserT[]>} */
export async function listUsers() {
  if (USE_MOCK_DATA) return mock.listUsers();
  return withFallback("listUsers", () => db.listUsers(), () => mock.listUsers());
}

/** @param {string} userId @returns {Promise<{ user: UserT, closeness: number }[]>} */
export async function getFriends(userId) {
  if (USE_MOCK_DATA) return mock.getFriends(userId);
  return withFallback("getFriends", () => db.getFriends(userId), () => mock.getFriends(userId));
}

/** @returns {Promise<PlaceT[]>} */
export async function getPlaces() {
  if (USE_MOCK_DATA) return mock.getPlaces();
  return withFallback("getPlaces", () => db.getPlaces(), () => mock.getPlaces());
}

/** @param {string} placeId @returns {Promise<PlaceT | null>} */
export async function getPlace(placeId) {
  if (USE_MOCK_DATA) return mock.getPlace(placeId);
  return withFallback("getPlace", () => db.getPlace(placeId), () => mock.getPlace(placeId));
}

/**
 * Busy blocks for these users that overlap `range`.
 * @param {string[]} userIds @param {TimeRangeT} range
 * @returns {Promise<import("@/types/domain").BusyBlockT[]>}
 */
export async function getBusyBlocks(userIds, range) {
  if (USE_MOCK_DATA) return mock.getBusyBlocks(userIds, range);
  return withFallback("getBusyBlocks", () => db.getBusyBlocks(userIds, range), () => mock.getBusyBlocks(userIds, range));
}

/**
 * Hourly weather for Montréal covering `range`. (The real version never throws: Open-Meteo
 * failures already fall back to the mock forecast inside lib/data/weather.js.)
 * @param {TimeRangeT} range
 * @returns {Promise<import("@/types/domain").HourlyWeatherT[]>}
 */
export async function getWeather(range) {
  if (USE_MOCK_DATA) return mock.getWeather(range);
  return getRealWeather(range);
}

/**
 * One row per (user, place). Real version: seeded ORS rows, haversine fallback for missing pairs.
 * @param {string[]} userIds @param {string[]} placeIds
 * @returns {Promise<import("@/types/domain").TravelTimeT[]>}
 */
export async function getTravelTimes(userIds, placeIds) {
  if (USE_MOCK_DATA) return mock.getTravelTimes(userIds, placeIds);
  return withFallback("getTravelTimes", () => db.getTravelTimes(userIds, placeIds), () => mock.getTravelTimes(userIds, placeIds));
}

/** @param {string} userId @returns {Promise<TagWeightsT>} */
export async function getTagWeights(userId) {
  if (USE_MOCK_DATA) return mock.getTagWeights(userId);
  return withFallback("getTagWeights", () => db.getTagWeights(userId), () => mock.getTagWeights(userId));
}

/** @param {string} userId @param {TagWeightsT} weights @returns {Promise<void>} */
export async function setTagWeights(userId, weights) {
  if (USE_MOCK_DATA) return mock.setTagWeights(userId, weights);
  return withFallback("setTagWeights", () => db.setTagWeights(userId, weights), () => mock.setTagWeights(userId, weights));
}

/**
 * @param {string} userId
 * @param {{ placeId: string, slotStart: string, action: "skip" | "save" | "go" }} input
 * @returns {Promise<InteractionT>}
 */
export async function recordInteraction(userId, input) {
  if (USE_MOCK_DATA) return mock.recordInteraction(userId, input);
  return withFallback("recordInteraction", () => db.recordInteraction(userId, input), () => mock.recordInteraction(userId, input));
}

/**
 * For novelty scoring: what the user has interacted with recently.
 * @param {string} userId @param {number} [sinceDays]
 * @returns {Promise<InteractionT[]>}
 */
export async function getRecentInteractions(userId, sinceDays = 14) {
  if (USE_MOCK_DATA) return mock.getRecentInteractions(userId, sinceDays);
  return withFallback(
    "getRecentInteractions",
    () => db.getRecentInteractions(userId, sinceDays),
    () => mock.getRecentInteractions(userId, sinceDays),
  );
}
