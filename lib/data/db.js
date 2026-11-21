/**
 * Supabase implementations of the lib/data contract. Owner: Adel.
 * lib/data/index.js calls these when USE_MOCK_DATA=false; same names, arguments and
 * return shapes as the mock versions there.
 *
 * Reads/writes use the service-role client (bypasses RLS) and are scoped ONLY by the ids
 * passed in. Callers build those ids from getSessionUserId() + getFriends(), never from a
 * request body (see lib/engine/load.js).
 * Every row goes through lib/data/mappers.js, which Zod-checks it outside production.
 * Errors are thrown with the table name; nothing is swallowed. Server-only.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  busyBlockToRow,
  interactionToRow,
  placeToRow,
  rowsToTagWeights,
  rowToBusyBlock,
  rowToInteraction,
  rowToPlace,
  rowToTravelTime,
  rowToUser,
  tagWeightsToRows,
  travelTimeToRow,
} from "./mappers";
import { computeTravelTimes, estimateRow } from "./travel";
import { REGISTRY_ID_MIN } from "./registry";

/** @typedef {import("@/types/domain").UserT} UserT */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").TimeRangeT} TimeRangeT */
/** @typedef {import("@/types/domain").InteractionT} InteractionT */
/** @typedef {import("@/types/domain").TagWeightsT} TagWeightsT */
/** @typedef {import("@/types/domain").TravelTimeT} TravelTimeT */

const USER_COLS = "id, name, avatar_url, home_lat, home_lng, interests";

/** Home for brand-new users until they pick a neighbourhood in onboarding (McGill). */
export const DEFAULT_HOME = Object.freeze({ lat: 45.5048, lng: -73.5772 });
const PLACE_COLS = "id, name, category, tags, lat, lng, address, price_level, photo_url, hours, typical_duration_min, indoor";

/** @type {ReturnType<typeof createAdminClient> | null} */
let client = null;
const db = () => (client ??= createAdminClient());

/**
 * Throw a readable error for a failed Supabase call.
 * @param {string} op  e.g. "users.select"
 * @param {{ message: string, code?: string } | null} error
 */
function fail(op, error) {
  if (!error) return;
  const err = new Error(`[lib/data/db] ${op} failed${error.code ? ` (${error.code})` : ""}: ${error.message}`);
  /** Postgres SQLSTATE (e.g. 23503 = foreign key violation), "" for network errors. */
  err.code = error.code ?? "";
  throw err;
}

/** @param {string} userId @returns {Promise<UserT | null>} */
export async function getUser(userId) {
  const { data, error } = await db().from("users").select(USER_COLS).eq("id", userId).maybeSingle();
  fail("users.select", error);
  return data ? rowToUser(data) : null;
}

/** Cheap existence check (primary-key lookup, no row data). @param {string} userId @returns {Promise<boolean>} */
export async function userExists(userId) {
  const { count, error } = await db().from("users").select("id", { count: "exact", head: true }).eq("id", userId);
  fail("users.exists", error);
  return (count ?? 0) > 0;
}

/** @param {string[]} userIds @returns {Promise<UserT[]>} */
export async function getUsers(userIds) {
  if (userIds.length === 0) return [];
  const { data, error } = await db().from("users").select(USER_COLS).in("id", userIds);
  fail("users.select", error);
  return (data ?? []).map(rowToUser);
}

/** @returns {Promise<UserT[]>} */
export async function listUsers() {
  const { data, error } = await db().from("users").select(USER_COLS).order("name");
  fail("users.select", error);
  return (data ?? []).map(rowToUser);
}

/**
 * Create the users row on first sign-in. Never overwrites an existing row (ON CONFLICT DO NOTHING),
 * so a profile edited in onboarding survives every later sign-in. Input is validated in index.js.
 * @param {{ id: string, name: string, avatarUrl: string }} u
 * @returns {Promise<UserT>}
 */
export async function ensureUser(u) {
  const row = { id: u.id, name: u.name, avatar_url: u.avatarUrl, home_lat: DEFAULT_HOME.lat, home_lng: DEFAULT_HOME.lng, interests: [] };
  const { error } = await db().from("users").upsert(row, { onConflict: "id", ignoreDuplicates: true });
  fail("users.insert", error);
  const user = await getUser(u.id);
  if (!user) throw new Error(`[lib/data/db] ensureUser: row for ${u.id} missing after insert`);
  return user;
}

/**
 * Update a user's profile. `patch` is already validated and resolved by index.js (home = the
 * neighbourhood's centre). When the home moves, recompute that user's travel times (ORS, ~2–3 s).
 * @param {string} userId
 * @param {{ name?: string, home?: { lat: number, lng: number }, interests?: string[] }} patch
 * @returns {Promise<UserT | null>} null = no such user
 */
export async function updateProfile(userId, patch) {
  const before = await getUser(userId);
  if (!before) return null;
  /** @type {Record<string, unknown>} */
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.interests !== undefined) row.interests = patch.interests;
  if (patch.home) {
    row.home_lat = patch.home.lat;
    row.home_lng = patch.home.lng;
  }
  if (Object.keys(row).length) {
    const { error } = await db().from("users").update(row).eq("id", userId);
    fail("users.update", error);
  }
  const user = await getUser(userId);
  if (!user) return null;
  if (patch.home && (before.homeLat !== user.homeLat || before.homeLng !== user.homeLng)) await recomputeTravelTimes(user);
  return user;
}

/**
 * Recompute one user's travel times to every place (ORS walking/cycling, haversine fallback).
 * Delete-then-insert: if the insert fails, getTravelTimes() still fills estimates, so the feed works.
 * @param {UserT} user
 */
async function recomputeTravelTimes(user) {
  const places = await getPlaces();
  const { rows, stats } = await computeTravelTimes([user], places);
  if (stats.errors.length) console.warn(`[lib/data/db] travel recompute for ${user.id}: ${stats.errors.join("; ")}`);
  const del = await db().from("travel_times").delete().eq("user_id", user.id);
  fail("travel_times.delete", del.error);
  if (rows.length) {
    const ins = await db().from("travel_times").insert(rows.map(travelTimeToRow));
    fail("travel_times.insert", ins.error);
  }
}

/**
 * Friend two users, both directions. Idempotent: re-adding keeps the existing rows (and closeness).
 * Both users must exist (FK). Input is validated in index.js.
 * @param {string} a @param {string} b @param {number} closeness
 */
export async function addFriendship(a, b, closeness) {
  const rows = [
    { user_id: a, friend_id: b, closeness },
    { user_id: b, friend_id: a, closeness },
  ];
  const { error } = await db().from("friendships").upsert(rows, { onConflict: "user_id,friend_id", ignoreDuplicates: true });
  fail("friendships.insert", error);
}

/**
 * Replace ALL of one user's busy blocks from `source` with `blocks`. Insert-then-delete, so if the
 * insert fails the old blocks stay (stale but safe) instead of the user suddenly looking free.
 * Input is validated in index.js (every block belongs to userId and has this source).
 * @param {string} userId
 * @param {import("@/types/domain").BusyBlockT[]} blocks
 * @param {"google" | "manual"} source
 * @returns {Promise<{ imported: number }>}
 */
export async function replaceBusyBlocks(userId, blocks, source) {
  const old = await db().from("busy_blocks").select("id").eq("user_id", userId).eq("source", source);
  fail("busy_blocks.select", old.error);
  if (blocks.length) {
    const rows = blocks.map((b) => {
      const { id: _drop, ...row } = busyBlockToRow(b); // let the DB generate fresh ids
      return row;
    });
    const ins = await db().from("busy_blocks").insert(rows);
    fail("busy_blocks.insert", ins.error);
  }
  const oldIds = (old.data ?? []).map((r) => r.id);
  if (oldIds.length) {
    const del = await db().from("busy_blocks").delete().in("id", oldIds);
    fail("busy_blocks.delete", del.error);
  }
  return { imported: blocks.length };
}

/** @param {string} userId @returns {Promise<{ user: UserT, closeness: number }[]>} */
export async function getFriends(userId) {
  const { data: links, error } = await db().from("friendships").select("friend_id, closeness").eq("user_id", userId);
  fail("friendships.select", error);
  if (!links?.length) return [];
  const users = await getUsers(links.map((l) => l.friend_id));
  const byId = new Map(users.map((u) => [u.id, u]));
  return links.flatMap((l) => {
    const user = byId.get(l.friend_id);
    return user ? [{ user, closeness: l.closeness }] : [];
  });
}

/** @returns {Promise<PlaceT[]>} */
export async function getPlaces() {
  // Curated places only: registry restaurants saved for a plan (ids >= REGISTRY_ID_MIN) aren't feed material.
  const { data, error } = await db().from("places").select(PLACE_COLS).lt("id", REGISTRY_ID_MIN).order("name");
  fail("places.select", error);
  return (data ?? []).map(rowToPlace);
}

const BUSINESS_COLS = "business_id, name, address, city, type, statut, latitude, longitude";

/**
 * Open registry restaurants inside a box whose name contains one of these words (raw rows; the exact
 * whole-word match, radius and dedupe happen in registry.js). public.businesses has no RLS policies:
 * server-only read through the service role.
 * @param {{ minLat: number, maxLat: number, minLng: number, maxLng: number }} box
 * @param {string[]} nameWords letters and single spaces only (checked in lib/cuisines.test.js), safe inside
 *   or(). Spaces become % ("o four" → %o%four%): a loose pre-filter, the exact whole-phrase match is in JS.
 * @returns {Promise<import("./registry").BusinessRow[]>}
 */
export async function findRegistryRows(box, nameWords) {
  const { data, error } = await db()
    .from("businesses")
    .select(BUSINESS_COLS)
    .eq("statut", "Ouvert")
    .ilike("type", "Restaurant%")
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLng)
    .lte("longitude", box.maxLng)
    .or(nameWords.map((w) => `name.ilike.%${w.replace(/ /g, "%")}%`).join(","))
    .limit(1000);
  fail("businesses.select", error);
  return data ?? [];
}

/**
 * Open registry restaurants inside a box whose name contains EVERY word (raw rows; the exact whole-word
 * match, radius and dedupe happen in registry.js). Words come from normalizeName (a–z, 0–9 only), so
 * they're safe in a filter. Accentable letters become `_` (any one character) so "cafe" still finds
 * "CAFÉ". One-letter words ("o" in "o four") are left to the exact check.
 * @param {{ minLat: number, maxLat: number, minLng: number, maxLng: number }} box
 * @param {string[]} words
 * @returns {Promise<import("./registry").BusinessRow[]>}
 */
export async function findRegistryRowsByName(box, words) {
  let q = db()
    .from("businesses")
    .select(BUSINESS_COLS)
    .eq("statut", "Ouvert")
    .ilike("type", "Restaurant%")
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLng)
    .lte("longitude", box.maxLng);
  for (const w of words.filter((x) => x.length > 1)) q = q.ilike("name", `%${w.replace(/[aceiouy]/g, "_")}%`);
  const { data, error } = await q.limit(1000);
  fail("businesses.select", error);
  return data ?? [];
}

/** @param {number} businessId @returns {Promise<import("./registry").BusinessRow | null>} */
export async function getRegistryRow(businessId) {
  const { data, error } = await db().from("businesses").select(BUSINESS_COLS).eq("business_id", businessId).maybeSingle();
  fail("businesses.select", error);
  return data ?? null;
}

/** Insert or refresh one place row (used for registry restaurants when a plan is made there). @param {PlaceT} place */
export async function upsertPlace(place) {
  const { error } = await db().from("places").upsert(placeToRow(place), { onConflict: "id" });
  fail("places.upsert", error);
}

/** @param {string} placeId @returns {Promise<PlaceT | null>} */
export async function getPlace(placeId) {
  const { data, error } = await db().from("places").select(PLACE_COLS).eq("id", placeId).maybeSingle();
  fail("places.select", error);
  return data ? rowToPlace(data) : null;
}

/**
 * Busy blocks for these users overlapping `range` (blocks are end-exclusive).
 * @param {string[]} userIds @param {TimeRangeT} range
 * @returns {Promise<import("@/types/domain").BusyBlockT[]>}
 */
export async function getBusyBlocks(userIds, range) {
  if (userIds.length === 0) return [];
  const { data, error } = await db()
    .from("busy_blocks")
    .select("id, user_id, start_at, end_at, source")
    .in("user_id", userIds)
    .lt("start_at", range.end)
    .gt("end_at", range.start)
    .order("start_at");
  fail("busy_blocks.select", error);
  return (data ?? []).map(rowToBusyBlock);
}

/**
 * Exactly one travel time per (user, place). Stored rows win (fastest mode if several);
 * pairs the seed didn't cover (e.g. a new Google user) get a haversine estimate (isEstimate = true).
 * @param {string[]} userIds @param {string[]} placeIds
 * @returns {Promise<TravelTimeT[]>}
 */
export async function getTravelTimes(userIds, placeIds) {
  if (userIds.length === 0 || placeIds.length === 0) return [];
  const { data, error } = await db()
    .from("travel_times")
    .select("user_id, place_id, minutes, mode, is_estimate")
    .in("user_id", userIds)
    .in("place_id", placeIds);
  fail("travel_times.select", error);

  /** @type {Map<string, TravelTimeT>} */
  const best = new Map();
  for (const t of (data ?? []).map(rowToTravelTime)) {
    const key = `${t.userId}:${t.placeId}`;
    const cur = best.get(key);
    if (!cur || (cur.isEstimate && !t.isEstimate) || (cur.isEstimate === t.isEstimate && t.minutes < cur.minutes)) best.set(key, t);
  }

  const missing = userIds.some((u) => placeIds.some((p) => !best.has(`${u}:${p}`)));
  if (missing) {
    // By id (not getPlaces()), so saved registry restaurants get estimates too.
    const [users, placesRes] = await Promise.all([getUsers(userIds), db().from("places").select(PLACE_COLS).in("id", placeIds)]);
    fail("places.select", placesRes.error);
    const placeById = new Map((placesRes.data ?? []).map(rowToPlace).map((p) => [p.id, p]));
    for (const u of users) {
      for (const pid of placeIds) {
        const place = placeById.get(pid);
        if (place && !best.has(`${u.id}:${pid}`)) best.set(`${u.id}:${pid}`, estimateRow(u, place));
      }
    }
  }
  return [...best.values()];
}

/** @param {string} userId @returns {Promise<TagWeightsT>} */
export async function getTagWeights(userId) {
  const { data, error } = await db().from("user_tag_weights").select("tag, weight").eq("user_id", userId);
  fail("user_tag_weights.select", error);
  return rowsToTagWeights(data ?? []);
}

/**
 * Upsert every tag in `weights`. (Learning only adds/changes tags, never removes them.)
 * @param {string} userId @param {TagWeightsT} weights @returns {Promise<void>}
 */
export async function setTagWeights(userId, weights) {
  const rows = tagWeightsToRows(userId, weights);
  if (rows.length === 0) return;
  const { error } = await db().from("user_tag_weights").upsert(rows, { onConflict: "user_id,tag" });
  fail("user_tag_weights.upsert", error);
}

/**
 * @param {string} userId
 * @param {{ placeId: string, slotStart: string, action: "skip" | "save" | "go" }} input
 * @returns {Promise<InteractionT>}
 */
export async function recordInteraction(userId, input) {
  const { data, error } = await db()
    .from("interactions")
    .insert(interactionToRow({ ...input, userId }))
    .select("id, user_id, place_id, slot_start, action, created_at")
    .single();
  fail("interactions.insert", error);
  return rowToInteraction(data);
}

/**
 * @param {string} userId @param {number} [sinceDays]
 * @returns {Promise<InteractionT[]>}
 */
export async function getRecentInteractions(userId, sinceDays = 14) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("interactions")
    .select("id, user_id, place_id, slot_start, action, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  fail("interactions.select", error);
  return (data ?? []).map(rowToInteraction);
}
