/**
 * DATA ACCESS CONTRACT. Owner: Adel.
 *
 * The engine (Anthony) and API routes ONLY get data through these functions.
 * USE_MOCK_DATA=true (default): every function returns mock data (demo safety switch).
 * USE_MOCK_DATA=false: Supabase (lib/data/db.js) + Open-Meteo (lib/data/weather.js).
 *   If a Supabase READ fails (network down, bad key, ...), the function logs a loud
 *   "[lib/data] ... falling back to mock data" error and returns the mock version instead,
 *   so the demo keeps working. Set DATA_FALLBACK=false to make those failures throw instead.
 *   Account-setup WRITES (ensureUser, updateProfile, addFriendship, replaceBusyBlocks) never
 *   fall back: they persist to Supabase or throw (see persist()).
 * Travel times are precomputed with OpenRouteService by the seed (POST /api/dev/seed).
 * Both modes keep the same names, arguments and return shapes.
 * FORCE_RAIN_DAY=<mon..sun|today> stages rain 13:00–18:00 that day, in both modes.
 * Server-only module: never import from a "use client" file.
 *
 * Shapes are documented with JSDoc typedefs from types/ (hover them in VS Code).
 */
import { z } from "zod";
import { BusyBlock, Closeness, Id } from "@/types/domain";
import { INTEREST_TAGS } from "@/lib/interests";
import { findNeighbourhood } from "@/lib/neighbourhoods";
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
/**
 * @type {{ interactions: InteractionT[], tagWeights: Map<string, TagWeightsT>,
 *          users: Map<string, UserT>, busy: Map<string, import("@/types/domain").BusyBlockT[]> }}
 */
const mem = (globalThis.__sqData ??= { interactions: [], tagWeights: new Map() });
mem.users ??= new Map(); // mock mode: users created by ensureUser(), and profile edits from updateProfile()
mem.busy ??= new Map(); // `${userId}:${source}` -> blocks saved by replaceBusyBlocks() in mock mode
mem.friendships ??= []; // FriendshipT rows added by addFriendship() in mock mode
/** Mock users (with any in-memory profile edits) plus anyone ensureUser() created in mock mode. */
const allMockUsers = () => [
  ...mockUsers.map((u) => mem.users.get(u.id) ?? u),
  ...[...mem.users.values()].filter((u) => !mockUsers.some((m) => m.id === u.id)),
];
/** Mock friendships plus the ones addFriendship() added in mock mode. */
const allMockFriendships = () => [...mockFriendships, ...mem.friendships];

/** @param {string} aStart @param {string} aEnd @param {TimeRangeT} r */
const overlaps = (aStart, aEnd, r) => Date.parse(aStart) < Date.parse(r.end) && Date.parse(aEnd) > Date.parse(r.start);

/**
 * Run the Supabase version; on failure, log loudly and run the mock version (unless DATA_FALLBACK=false).
 * Integrity violations (bad foreign key etc.) are NOT treated as outages: they throw DataInputError.
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
    // Integrity violations (SQLSTATE class 23: foreign key, unique, check) are a real answer from the
    // database ("that user doesn't exist"), not an outage: surface them instead of faking success.
    if (/^23/.test(err?.code ?? "")) throw new DataInputError(err.message);
    if (!DATA_FALLBACK) throw err;
    console.error(`[lib/data] ${name} failed on Supabase, falling back to mock data: ${err instanceof Error ? err.message : err}`);
    return fallback();
  }
}

/**
 * Account-setup writes (users row, profile, friendships, calendar blocks) NEVER fall back to the
 * in-memory mocks: a write that only lands in memory looks saved, then every later read goes to
 * Supabase, finds nothing and 404s (a signed-in user with no users row). They persist or throw.
 * Integrity violations still become DataInputError.
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} real
 * @returns {Promise<T>}
 */
async function persist(name, real) {
  try {
    return await real();
  } catch (err) {
    if (/^23/.test(err?.code ?? "")) throw new DataInputError(err.message);
    console.error(`[lib/data] ${name} failed on Supabase (not falling back, account writes must persist): ${err instanceof Error ? err.message : err}`);
    throw err;
  }
}

// --- mock implementations (USE_MOCK_DATA=true, and the fallback target) ------

const mock = {
  /** @param {string} userId */
  getUser: async (userId) => allMockUsers().find((u) => u.id === userId) ?? null,
  /** @param {string[]} userIds */
  getUsers: async (userIds) => allMockUsers().filter((u) => userIds.includes(u.id)),
  listUsers: async () => allMockUsers(),
  /** @param {{ id: string, name: string, avatarUrl: string }} u */
  ensureUser: async (u) => {
    const existing = allMockUsers().find((x) => x.id === u.id);
    if (existing) return existing;
    /** @type {UserT} */
    const user = { id: u.id, name: u.name, avatarUrl: u.avatarUrl, homeLat: db.DEFAULT_HOME.lat, homeLng: db.DEFAULT_HOME.lng, interests: [] };
    mem.users.set(u.id, user);
    return user;
  },
  /** @param {string} userId @param {import("@/types/domain").BusyBlockT[]} blocks @param {string} source */
  replaceBusyBlocks: async (userId, blocks, source) => {
    mem.busy.set(`${userId}:${source}`, blocks);
    return { imported: blocks.length };
  },
  /** @param {string} userId @param {{ name?: string, home?: { lat: number, lng: number }, interests?: string[] }} patch */
  updateProfile: async (userId, patch) => {
    const u = allMockUsers().find((x) => x.id === userId);
    if (!u) return null;
    /** @type {UserT} */
    const next = {
      ...u,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
      ...(patch.home ? { homeLat: patch.home.lat, homeLng: patch.home.lng } : {}),
    };
    mem.users.set(userId, next); // mock travel times are haversine from home, so they follow automatically
    return next;
  },
  /** @param {string} a @param {string} b @param {number} closeness */
  addFriendship: async (a, b, closeness) => {
    const has = (x, y) => allMockFriendships().some((f) => f.userId === x && f.friendId === y);
    if (!has(a, b)) mem.friendships.push({ userId: a, friendId: b, closeness });
    if (!has(b, a)) mem.friendships.push({ userId: b, friendId: a, closeness });
  },
  /** @param {string} userId */
  getFriends: async (userId) => {
    const users = allMockUsers();
    return allMockFriendships()
      .filter((f) => f.userId === userId)
      .flatMap((f) => {
        const user = users.find((u) => u.id === f.friendId);
        return user ? [{ user, closeness: f.closeness }] : [];
      });
  },
  getPlaces: async () => mockPlaces,
  /** @param {string} placeId */
  getPlace: async (placeId) => mockPlaces.find((p) => p.id === placeId) ?? null,
  /** @param {string[]} userIds @param {TimeRangeT} range */
  getBusyBlocks: async (userIds, range) =>
    [...buildMockBusyBlocks(8), ...[...mem.busy.values()].flat()].filter(
      (b) => userIds.includes(b.userId) && overlaps(b.startAt, b.endAt, range),
    ),
  /** @param {TimeRangeT} range */
  getWeather: async (range) => {
    const hours = buildMockWeather(8).filter((w) => overlaps(w.time, new Date(Date.parse(w.time) + 3_600_000).toISOString(), range));
    const day = forcedRainDay();
    return day ? applyRainyDay(hours, day) : hours;
  },
  /** @param {string[]} userIds @param {string[]} placeIds */
  getTravelTimes: async (userIds, placeIds) => {
    const users = allMockUsers().filter((u) => userIds.includes(u.id)); // incl. ensured users + edited homes
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

/**
 * Does this user have a users row? Used by proxy.js to send signed-in users without a row back to
 * /login (signing in again recreates the row via ensureUser). FAILS OPEN: if Supabase can't answer,
 * returns true, so an outage never signs everyone out (routes still handle their own errors).
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function userExists(userId) {
  if (USE_MOCK_DATA) return allMockUsers().some((u) => u.id === userId);
  try {
    return await db.userExists(userId);
  } catch (err) {
    console.warn(`[lib/data] userExists(${userId}) couldn't check Supabase, letting the request through: ${err instanceof Error ? err.message : err}`);
    return true;
  }
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

const EnsureUserInput = z.object({
  id: Id,
  name: z.string().nullish().transform((n) => n?.trim() || "New user"), // users.name must be non-empty
  avatarUrl: z.string().nullish().transform((a) => a ?? ""),
});

/**
 * First sign-in: create the users row if it's missing (home = McGill until onboarding, interests = []).
 * NEVER overwrites an existing user, so it's safe to call on every sign-in.
 * @param {{ id: string, name: string, avatarUrl: string }} input
 * @returns {Promise<UserT>}
 */
export async function ensureUser(input) {
  const u = EnsureUserInput.parse(input);
  if (USE_MOCK_DATA) return mock.ensureUser(u);
  return persist("ensureUser", () => db.ensureUser(u));
}

/**
 * Bad input to a lib/data write (unknown neighbourhood, tag, user...). Routes can map it to 400:
 *   if (err instanceof DataInputError) return jsonError(400, err.message);
 */
export class DataInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "DataInputError";
    this.status = 400;
  }
}

/**
 * Where a home may be: Greater Montréal (island, Laval, Longueuil / South Shore, West Island).
 * Generous on purpose; a far home just means fewer cards (the engine caps travel at 35 min).
 */
export const HOME_AREA = { minLat: 45.35, maxLat: 45.75, minLng: -74.05, maxLng: -73.35 };
const inHomeArea = ({ lat, lng }) => lat >= HOME_AREA.minLat && lat <= HOME_AREA.maxLat && lng >= HOME_AREA.minLng && lng <= HOME_AREA.maxLng;

const UpdateProfileInput = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    neighbourhoodId: z.string().optional(),
    // Server-only: from the postal-code lookup (lib/geo/postalCode.js), never from a request body.
    home: z.object({ lat: z.number(), lng: z.number() }).strict().optional(), // z.number() rejects NaN/Infinity (Zod 4)
    interests: z.array(z.string()).max(INTEREST_TAGS.length).optional(),
  })
  .strict(); // no homeLat/homeLng etc.

/**
 * Edit a profile from onboarding / settings. Only the fields given are changed.
 * - home: { lat, lng } from the postal-code lookup (server-only, never raw client input), inside
 *   HOME_AREA. If the home moves, the user's travel times are recomputed (ORS, ~2–3 s) before this resolves.
 * - neighbourhoodId: one of lib/neighbourhoods.js; home = that neighbourhood's centre (same recompute).
 *   Kept until onboarding switches to postal codes. Give home OR neighbourhoodId, not both.
 * - interests: tags from lib/interests.js only (the engine compares them to place tags); duplicates
 *   are dropped. Non-empty interests make the user "returning" (skips onboarding at sign-in).
 * Throws DataInputError for bad input. Returns null if the user doesn't exist.
 * @param {string} userId
 * @param {{ name?: string, home?: { lat: number, lng: number }, neighbourhoodId?: string, interests?: string[] }} input
 * @returns {Promise<UserT | null>}
 */
export async function updateProfile(userId, input) {
  if (!Id.safeParse(userId).success) throw new DataInputError(`Invalid user id: ${userId}`);
  const parsed = UpdateProfileInput.safeParse(input ?? {});
  if (!parsed.success) throw new DataInputError(`Invalid profile: ${z.prettifyError(parsed.error)}`);
  const { name, home, neighbourhoodId, interests } = parsed.data;
  if (home && neighbourhoodId !== undefined) throw new DataInputError("Give home or neighbourhoodId, not both");
  /** @type {{ name?: string, home?: { lat: number, lng: number }, interests?: string[] }} */
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (home) {
    if (!inHomeArea(home)) throw new DataInputError(`Home (${home.lat}, ${home.lng}) is outside the Montréal area`);
    patch.home = { lat: home.lat, lng: home.lng };
  }
  if (neighbourhoodId !== undefined) {
    const n = findNeighbourhood(neighbourhoodId);
    if (!n) throw new DataInputError(`Unknown neighbourhood: ${neighbourhoodId}`);
    patch.home = { lat: n.lat, lng: n.lng };
  }
  if (interests !== undefined) {
    const unknown = interests.filter((t) => !INTEREST_TAGS.includes(t));
    if (unknown.length) throw new DataInputError(`Unknown interests: ${unknown.join(", ")}`);
    patch.interests = [...new Set(interests)];
  }
  if (USE_MOCK_DATA) return mock.updateProfile(userId, patch);
  return persist("updateProfile", () => db.updateProfile(userId, patch));
}

/**
 * Friend two users, both directions (a -> b and b -> a, same closeness). Idempotent: adding an
 * existing friendship changes nothing. Pass a = getSessionUserId(), never an id from the request body.
 * Throws DataInputError for bad ids, a === b, or closeness outside 1–3.
 * @param {string} a
 * @param {string} b
 * @param {number} [closeness]  1–3, default 2
 * @returns {Promise<void>}
 */
export async function addFriendship(a, b, closeness = 2) {
  if (!Id.safeParse(a).success || !Id.safeParse(b).success) throw new DataInputError("Invalid user id");
  if (a === b) throw new DataInputError("Can't friend yourself");
  if (!Closeness.safeParse(closeness).success) throw new DataInputError(`Closeness must be 1–3, got ${closeness}`);
  if (USE_MOCK_DATA) return mock.addFriendship(a, b, closeness);
  return persist("addFriendship", () => db.addFriendship(a, b, closeness));
}

const ReplaceSource = z.enum(["google", "manual"]); // 'seed' rows belong to the demo reset only

/**
 * Replace ALL of `userId`'s busy blocks from `source` with `blocks` (may be empty = now free).
 * Other sources are never touched: calendar sync can't erase seed/manual blocks, and the demo
 * reset keeps google blocks. Every block must belong to `userId`, have this `source`, and end
 * after it starts (UTC ISO, end-exclusive). Returns how many blocks were saved.
 * @param {string} userId
 * @param {import("@/types/domain").BusyBlockT[]} blocks
 * @param {"google" | "manual"} [source]
 * @returns {Promise<{ imported: number }>}
 */
export async function replaceBusyBlocks(userId, blocks, source = "google") {
  Id.parse(userId);
  const src = ReplaceSource.parse(source);
  const parsed = z.array(BusyBlock).parse(blocks);
  for (const b of parsed) {
    if (b.userId !== userId) throw new Error(`replaceBusyBlocks: block for ${b.userId} passed for user ${userId}`);
    if (b.source !== src) throw new Error(`replaceBusyBlocks: block with source '${b.source}' passed as '${src}'`);
    if (Date.parse(b.endAt) <= Date.parse(b.startAt)) throw new Error(`replaceBusyBlocks: block ends before it starts (${b.startAt})`);
  }
  if (USE_MOCK_DATA) return mock.replaceBusyBlocks(userId, parsed, src);
  return persist("replaceBusyBlocks", () => db.replaceBusyBlocks(userId, parsed, src));
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
