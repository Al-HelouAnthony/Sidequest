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
  interactionToRow,
  rowsToTagWeights,
  rowToBusyBlock,
  rowToInteraction,
  rowToPlace,
  rowToTravelTime,
  rowToUser,
  tagWeightsToRows,
} from "./mappers";
import { estimateRow } from "./travel";

/** @typedef {import("@/types/domain").UserT} UserT */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").TimeRangeT} TimeRangeT */
/** @typedef {import("@/types/domain").InteractionT} InteractionT */
/** @typedef {import("@/types/domain").TagWeightsT} TagWeightsT */
/** @typedef {import("@/types/domain").TravelTimeT} TravelTimeT */

const USER_COLS = "id, name, avatar_url, home_lat, home_lng, interests";
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
  if (error) throw new Error(`[lib/data/db] ${op} failed${error.code ? ` (${error.code})` : ""}: ${error.message}`);
}

/** @param {string} userId @returns {Promise<UserT | null>} */
export async function getUser(userId) {
  const { data, error } = await db().from("users").select(USER_COLS).eq("id", userId).maybeSingle();
  fail("users.select", error);
  return data ? rowToUser(data) : null;
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
  const { data, error } = await db().from("places").select(PLACE_COLS).order("name");
  fail("places.select", error);
  return (data ?? []).map(rowToPlace);
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
    const [users, places] = await Promise.all([getUsers(userIds), getPlaces()]);
    const placeById = new Map(places.map((p) => [p.id, p]));
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
