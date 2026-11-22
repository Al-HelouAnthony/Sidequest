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
import { BusyBlock, Closeness, Id, Place, TimeRange } from "@/types/domain";
import { INTEREST_TAGS } from "@/lib/interests";
import { findNeighbourhood } from "@/lib/neighbourhoods";
import { mockFriendships, mockUsers } from "@/lib/mocks/users";
import { mockPlaces } from "@/lib/mocks/places";
import { mockRegistryRows } from "@/lib/mocks/registry";
import { buildMockEventRows } from "@/lib/mocks/events";
import { findCuisine, nameHasAllWords, normalizeName, registryTerms } from "@/lib/cuisines";
import { buildMockBusyBlocks } from "@/lib/mocks/schedules";
import { buildMockWeather } from "@/lib/mocks/weather";
import * as db from "./db";
import { estimateTravelMin, haversineKm } from "./geo";
import { applyRainyDay, forcedRainDay, getRealWeather } from "./weather";
import { boundingBox, businessIdFrom, isRegistryPlaceId, isVenuePlaceId, pickRegistryPlaces, registryRowToPlace } from "./registry";

import { defaultEventRange, eventKeyFrom, eventRowToPlace, isEventPlaceId, localDay, pickEvents } from "./events";

export { isRegistryPlaceId, isVenuePlaceId, isEventPlaceId };

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
mem.removedFriendships ??= new Set(); // "a|b" pairs removed by removeFriendship() in mock mode
mem.googleTokens ??= new Map(); // userId -> { refreshToken, scope } saved by saveGoogleRefreshToken() in mock mode
mem.registryPlaces ??= new Map(); // id -> registry restaurant saved by ensurePlaceFromRegistry() in mock mode
/** Mock places a plan can point at: the mock list + saved registry restaurants. */
const allMockPlaces = () => [...mockPlaces, ...mem.registryPlaces.values()];
/** Mock users (with any in-memory profile edits) plus anyone ensureUser() created in mock mode. */
const allMockUsers = () => [
  ...mockUsers.map((u) => mem.users.get(u.id) ?? u),
  ...[...mem.users.values()].filter((u) => !mockUsers.some((m) => m.id === u.id)),
];
/** Mock friendships plus the ones addFriendship() added in mock mode. */
const allMockFriendships = () =>
  [...mockFriendships, ...mem.friendships].filter((f) => !mem.removedFriendships.has(`${f.userId}|${f.friendId}`));

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
    mem.removedFriendships.delete(`${a}|${b}`);
    mem.removedFriendships.delete(`${b}|${a}`);
  },
  /** @param {string} a @param {string} b */
  removeFriendship: async (a, b) => {
    mem.removedFriendships.add(`${a}|${b}`);
    mem.removedFriendships.add(`${b}|${a}`);
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
  getPlace: async (placeId) => allMockPlaces().find((p) => p.id === placeId) ?? null,
  /** Same filters as db.findRegistryRows, on the small real sample. */
  findRegistryRows: async (box, nameWords) => {
    const words = nameWords.map((w) => w.toLowerCase());
    return mockRegistryRows.filter(
      (r) =>
        r.statut === "Ouvert" && /^restaurant/i.test(r.type ?? "") && r.latitude != null && r.longitude != null &&
        r.latitude >= box.minLat && r.latitude <= box.maxLat && r.longitude >= box.minLng && r.longitude <= box.maxLng &&
        words.some((w) => r.name.toLowerCase().includes(w)),
    );
  },
  /** Same filters as db.findRegistryRowsByName (the exact whole-word check happens in registry.js). */
  findRegistryRowsByName: async (box, words) =>
    mockRegistryRows.filter(
      (r) =>
        r.statut === "Ouvert" && /^restaurant/i.test(r.type ?? "") && r.latitude != null && r.longitude != null &&
        r.latitude >= box.minLat && r.latitude <= box.maxLat && r.longitude >= box.minLng && r.longitude <= box.maxLng &&
        nameHasAllWords(r.name, words),
    ),
  /** @param {number} businessId */
  getRegistryRow: async (businessId) => mockRegistryRows.find((r) => r.business_id === businessId) ?? null,
  /** @param {string} userId @param {string} refreshToken @param {string | null} scope */
  upsertGoogleToken: async (userId, refreshToken, scope) => {
    mem.googleTokens.set(userId, { refreshToken, scope });
  },
  /** @param {string} userId */
  getGoogleToken: async (userId) => mem.googleTokens.get(userId)?.refreshToken ?? null,
  /** @param {string} userId */
  deleteGoogleToken: async (userId) => {
    mem.googleTokens.delete(userId);
  },
  /** Same filters as db.findEventRows, on the sample events (dates relative to today). */
  findEventRows: async (box, fromDate, toDate) =>
    buildMockEventRows().filter(
      (r) =>
        r.start_at && r.lat != null && r.lng != null && (r.start_date ?? "") <= toDate && (r.end_date ?? "") >= fromDate &&
        r.lat >= box.minLat && r.lat <= box.maxLat && r.lng >= box.minLng && r.lng <= box.maxLng,
    ),
  /** @param {string} key */
  getEventRowByKey: async (key) => buildMockEventRows().find((r) => r.id.slice(-12) === key) ?? null,
  /** @param {PlaceT} place */
  upsertPlace: async (place) => {
    mem.registryPlaces.set(place.id, place);
  },
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
    const places = allMockPlaces().filter((p) => placeIds.includes(p.id));
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
    // Shown to the user under the postal-code field (Oscar): no coordinates in the message.
    if (!inHomeArea(home)) throw new DataInputError("That postal code is outside the Montréal area (we cover the island, Laval, Longueuil and the West Island)");
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

/**
 * Unfriend two users, both directions. Idempotent: not friends (or unknown user) → nothing happens.
 * Plans already made together stay. Used by DELETE /api/friends/[id] (the Friends tab's "Remove").
 * Pass a = getSessionUserId(), never an id from the request body. Throws DataInputError for bad ids or a === b.
 * (QA: the route and the button existed, but this function was never merged → every "Remove" answered 405.)
 * @param {string} a
 * @param {string} b
 * @returns {Promise<void>}
 */
export async function removeFriendship(a, b) {
  if (!Id.safeParse(a).success || !Id.safeParse(b).success) throw new DataInputError("Invalid user id");
  if (a === b) throw new DataInputError("Can't unfriend yourself");
  if (USE_MOCK_DATA) return mock.removeFriendship(a, b);
  return persist("removeFriendship", () => db.removeFriendship(a, b));
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
  // City events: the full event Place (startsAt, eventUrl, tags) from the events table, so the plan
  // screen and Book it keep them; the places row (ensurePlaceFromEvent) only holds the basics.
  if (isEventPlaceId(placeId)) {
    const event = await eventPlaceById(placeId);
    if (event) return event;
  }
  if (USE_MOCK_DATA) return mock.getPlace(placeId);
  return withFallback("getPlace", () => db.getPlace(placeId), () => mock.getPlace(placeId));
}

const SearchRegistryInput = z
  .object({
    cuisine: z.string(),
    near: z.object({ lat: z.number(), lng: z.number() }).strict(),
    radiusKm: z.number().positive().max(15).default(6),
    limit: z.number().int().min(1).max(100).default(40),
  })
  .strict();

/**
 * Cuisine search over the city health registry (~5,500 open restaurants), for N1.
 * Returns registry restaurants of that cuisine near a point, nearest first, as Place objects with
 * `source: "registry"`, `hoursVerified: false` (hours ASSUMED 11:30–22:00), `tags: [cuisine, …]`.
 * Registry copies of curated places are left out (the curated one already carries the cuisine tag).
 * These are NOT in the places table until someone makes a plan there (ensurePlaceFromRegistry).
 * Mock mode / Supabase down: a 30-row real sample around McGill (lib/mocks/registry.js).
 * Throws DataInputError for an unknown cuisine or a point outside HOME_AREA.
 * @param {{ cuisine: string, near: { lat: number, lng: number }, radiusKm?: number, limit?: number }} input
 * @returns {Promise<import("./registry").RegistryPlaceT[]>}
 */
export async function searchRegistry(input) {
  const parsed = SearchRegistryInput.safeParse(input ?? {});
  if (!parsed.success) throw new DataInputError(`Invalid registry search: ${z.prettifyError(parsed.error)}`);
  const { cuisine, near, radiusKm, limit } = parsed.data;
  const c = findCuisine(cuisine);
  if (!c) throw new DataInputError(`Unknown cuisine: ${cuisine}`);
  if (!inHomeArea(near)) throw new DataInputError(`Search point (${near.lat}, ${near.lng}) is outside the Montréal area`);

  const box = boundingBox(near, radiusKm);
  const terms = registryTerms(c); // name words + known names ("o four", "boustan"…)
  const [rows, curated] = await Promise.all([
    USE_MOCK_DATA ? mock.findRegistryRows(box, terms) : withFallback("searchRegistry", () => db.findRegistryRows(box, terms), () => mock.findRegistryRows(box, terms)),
    getPlaces(),
  ]);
  return pickRegistryPlaces(rows, { cuisine, near, radiusKm, limit, curated });
}

const SearchRegistryByNameInput = z
  .object({
    text: z.string().max(100),
    near: z.object({ lat: z.number(), lng: z.number() }).strict(),
    radiusKm: z.number().positive().max(15).default(6),
    limit: z.number().int().min(1).max(100).default(40),
  })
  .strict();

/**
 * Name search over the city health registry: open restaurants whose name contains EVERY word of
 * `text` (whole words, accents/case ignored: "o four" → O Four, "schwartz" → Schwartz's), nearest
 * first, as Places with `source: "registry"`, `hoursVerified: false`. Unlike searchRegistry, places
 * with no recognisable cuisine are kept (`tags: []`). Registry copies of curated places are left out.
 * Nothing found / empty text → [] (never throws for that). Bad input (point outside HOME_AREA,
 * silly radius) → DataInputError. Mock mode / Supabase down: the 30-row sample.
 * @param {{ text: string, near: { lat: number, lng: number }, radiusKm?: number, limit?: number }} input
 * @returns {Promise<import("./registry").RegistryPlaceT[]>}
 */
export async function searchRegistryByName(input) {
  const parsed = SearchRegistryByNameInput.safeParse(input ?? {});
  if (!parsed.success) throw new DataInputError(`Invalid registry name search: ${z.prettifyError(parsed.error)}`);
  const { text, near, radiusKm, limit } = parsed.data;
  if (!inHomeArea(near)) throw new DataInputError(`Search point (${near.lat}, ${near.lng}) is outside the Montréal area`);
  const words = normalizeName(text).trim().split(" ").filter(Boolean).slice(0, 6);
  if (!words.length) return [];

  const box = boundingBox(near, radiusKm);
  const [rows, curated] = await Promise.all([
    USE_MOCK_DATA
      ? mock.findRegistryRowsByName(box, words)
      : withFallback("searchRegistryByName", () => db.findRegistryRowsByName(box, words), () => mock.findRegistryRowsByName(box, words)),
    getPlaces(),
  ]);
  return pickRegistryPlaces(rows, { words, near, radiusKm, limit, curated });
}

/**
 * Make a registry restaurant a real `places` row, so a plan can point at it (plans.place_id is a
 * foreign key). Call it when creating a plan, before inserting the plan. Idempotent.
 * Only the id is used: the place is rebuilt from the registry row, never from client data.
 * - Not a registry id (a curated place) → null, nothing to do.
 * - Registry id but the restaurant is unknown, closed or not a restaurant → DataInputError (400).
 * Never falls back to memory when Supabase is down (a plan must not point at a phantom place).
 * @param {string | { id: string }} placeOrId
 * @returns {Promise<import("./registry").RegistryPlaceT | null>}
 */
export async function ensurePlaceFromRegistry(placeOrId) {
  const id = typeof placeOrId === "string" ? placeOrId : placeOrId?.id;
  const businessId = businessIdFrom(id);
  if (businessId === null) return null;
  const src = USE_MOCK_DATA ? mock : db;
  const row = await persist("ensurePlaceFromRegistry", () => src.getRegistryRow(businessId));
  if (!row) throw new DataInputError(`Unknown registry restaurant: ${id}`);
  if (row.statut !== "Ouvert" || !/^restaurant/i.test(row.type ?? "")) throw new DataInputError(`${row.name} is not an open restaurant`);
  const place = registryRowToPlace(row, { allowNoCuisine: true }); // may come from a name search ("o four")
  if (!place) throw new DataInputError(`${row.name} has no location`);
  await persist("ensurePlaceFromRegistry", () => src.upsertPlace(place));
  return place;
}

/**
 * Make an OpenStreetMap venue (Mhammad's lib/geo/venues.json, search-only) a real `places` row, so a plan
 * can point at it (plans.place_id is a foreign key). Same idea as ensurePlaceFromRegistry; idempotent.
 * Pass the Place built SERVER-SIDE from the venue list by id (e.g. venueToPlace of the row with that id),
 * never data from the request body: the venue list lives in lib/geo, so the lookup stays there.
 * Saved venues stay out of the normal feed (ids 4000… are above REGISTRY_ID_MIN) and come back from
 * getPlace() with hoursVerified: false.
 * - null/undefined (no venue with that id) → DataInputError (400)
 * - id that isn't a venue id, or a Place that doesn't match the contract → DataInputError (400)
 * Never falls back to memory when Supabase is down (a plan must not point at a phantom place).
 * @param {PlaceT | null | undefined} place
 * @returns {Promise<PlaceT & { hoursVerified: false }>}
 */
export async function ensurePlaceFromVenue(place) {
  if (!place) throw new DataInputError("Unknown venue");
  if (!isVenuePlaceId(place.id)) throw new DataInputError(`Not a venue id: ${place.id}`);
  const parsed = Place.safeParse(place);
  if (!parsed.success) throw new DataInputError(`Invalid venue place: ${z.prettifyError(parsed.error)}`);
  const saved = { ...parsed.data, hoursVerified: /** @type {const} */ (false) };
  const src = USE_MOCK_DATA ? mock : db;
  await persist("ensurePlaceFromVenue", () => src.upsertPlace(saved));
  return saved;
}

// ---- G2: Google refresh tokens (google_tokens, migration 0007) ---------------------------------------
// Server-only: never return these from an API route, never log them. Errors never contain the token.

const TokenInput = z.object({
  userId: Id,
  refreshToken: z.string().min(1).max(4096),
  scope: z.string().max(1000).nullable(),
});

/**
 * Keep the user's long-lived Google refresh token (sign-in callback, Anthony's afterSignIn), so plans can
 * be added to their Google Calendar later. One per user: a new sign-in replaces it. Always persists to
 * Supabase or throws (never kept in memory as a fake success). Unknown user → DataInputError.
 * @param {string} userId
 * @param {string} refreshToken
 * @param {string | null} [scope] e.g. "https://www.googleapis.com/auth/calendar.events"
 * @returns {Promise<void>}
 */
export async function saveGoogleRefreshToken(userId, refreshToken, scope = null) {
  const parsed = TokenInput.safeParse({ userId, refreshToken, scope });
  if (!parsed.success) throw new DataInputError("Invalid Google token input (userId must be a uuid, token a non-empty string)");
  const src = USE_MOCK_DATA ? mock : db;
  await persist("saveGoogleRefreshToken", () => src.upsertGoogleToken(userId, refreshToken, scope));
}

/**
 * The user's Google refresh token, or null when they never connected Google (demo users) or the id is
 * not a uuid. Read failure (Supabase down) → null, so the calendar step is skipped, never the RSVP.
 * @param {string} userId
 * @returns {Promise<string | null>}
 */
export async function getGoogleRefreshToken(userId) {
  if (!Id.safeParse(userId).success) return null;
  if (USE_MOCK_DATA) return mock.getGoogleToken(userId);
  try {
    return await db.getGoogleToken(userId);
  } catch (err) {
    console.error(`[lib/data] getGoogleRefreshToken failed on Supabase, treating as not connected: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Forget the user's Google token (Google answered invalid_grant: revoked or expired), so the app shows
 * "Reconnect Google" instead of retrying. Idempotent.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function deleteGoogleRefreshToken(userId) {
  if (!Id.safeParse(userId).success) throw new DataInputError(`Invalid user id: ${userId}`);
  const src = USE_MOCK_DATA ? mock : db;
  await persist("deleteGoogleRefreshToken", () => src.deleteGoogleToken(userId));
}

// ---- City events (N: events in the feed, Anthony) -------------------------------------------------

const EventsInput = z.object({ range: TimeRange, near: z.object({ lat: z.number(), lng: z.number() }) });
const EVENTS_TTL_MS = 2 * 60_000;
/** @type {Map<string, { at: number, value: Promise<import("./events").EventPlaceT[]> }>} */
const eventsCache = new Map();

/**
 * Montréal city events for the feed: worth showing (lib/data/eventRules.js), with an exact start,
 * active in `range`, within ~8 km of `near`, nearest 40, as Places (category "event", source "event",
 * hours = the event's own window, startsAt + eventUrl; multi-day exhibitions daily 11:00–17:00,
 * hoursVerified false). See lib/data/events.js. Cached 2 min (the feed calls it on every load).
 * Mock mode / Supabase down: sample events relative to today (lib/mocks/events.js).
 * Bad input → DataInputError (the engine catches it and shows no events).
 * @param {TimeRangeT} range
 * @param {{ lat: number, lng: number }} near
 * @returns {Promise<import("./events").EventPlaceT[]>}
 */
export async function getEvents(range, near) {
  const parsed = EventsInput.safeParse({ range, near });
  if (!parsed.success) throw new DataInputError(`Invalid events query: ${z.prettifyError(parsed.error)}`);
  const fromDate = localDay(range.start);
  const toDate = localDay(range.end);
  const key = `${USE_MOCK_DATA}|${range.start.slice(0, 13)}|${range.end.slice(0, 13)}|${near.lat.toFixed(3)},${near.lng.toFixed(3)}`;
  const hit = eventsCache.get(key);
  if (hit && Date.now() - hit.at < EVENTS_TTL_MS) return hit.value;
  const box = boundingBox(near, 8);
  const value = (USE_MOCK_DATA
    ? mock.findEventRows(box, fromDate, toDate)
    : withFallback("getEvents", () => db.findEventRows(box, fromDate, toDate), () => mock.findEventRows(box, fromDate, toDate))
  ).then((rows) => pickEvents(rows, { range, near, radiusKm: 8, limit: 40 }));
  eventsCache.set(key, { at: Date.now(), value });
  value.catch(() => eventsCache.delete(key));
  return value;
}

/**
 * One city event as a Place, by its place id ("50000000-0000-4000-8000-<place_key>"). Built from the
 * events table (needs migration 0006 for place_key). Not an event id / unknown → null.
 * Hours cover yesterday → 8 days ahead; an event outside that window gets its own dates.
 * @param {string} placeId
 * @returns {Promise<import("./events").EventPlaceT | null>}
 */
export async function eventPlaceById(placeId) {
  const key = eventKeyFrom(placeId);
  if (!key) return null;
  const row = USE_MOCK_DATA
    ? await mock.getEventRowByKey(key)
    : await withFallback("eventPlaceById", () => db.getEventRowByKey(key), () => mock.getEventRowByKey(key));
  if (!row) return null;
  const own = row.start_at ? { start: row.start_at, end: row.end_at ?? new Date(Date.parse(row.start_at) + 7_200_000).toISOString() } : null;
  return eventRowToPlace(row, defaultEventRange()) ?? (own ? eventRowToPlace(row, own) : null);
}

/**
 * Make a city event a real `places` row so a plan / swipe can point at it (foreign keys). Pass the Place
 * from eventPlaceById (server-side, never the request body). Idempotent. The row only keeps the basics;
 * getPlace() still returns the full event (startsAt, eventUrl) from the events table.
 * - null (unknown event) / not an event id / broken Place → DataInputError (400)
 * Never falls back to memory when Supabase is down.
 * @param {import("./events").EventPlaceT | null | undefined} place
 * @returns {Promise<import("./events").EventPlaceT>}
 */
export async function ensurePlaceFromEvent(place) {
  if (!place) throw new DataInputError("Unknown event");
  if (!isEventPlaceId(place.id)) throw new DataInputError(`Not an event id: ${place.id}`);
  // The places row stores only the basics: check those (works with or without "event" in Place.source).
  const { source: _source, startsAt: _startsAt, eventUrl: _eventUrl, ...basics } = place;
  const parsed = Place.safeParse(basics);
  if (!parsed.success) throw new DataInputError(`Invalid event place: ${z.prettifyError(parsed.error)}`);
  const src = USE_MOCK_DATA ? mock : db;
  await persist("ensurePlaceFromEvent", () => src.upsertPlace(parsed.data));
  return place;
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
