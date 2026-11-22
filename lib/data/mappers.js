/**
 * Row mappers: Supabase rows (snake_case) <-> domain shapes in types/domain.js (camelCase).
 * Owner: Adel. Used by lib/data/* (reads) and lib/data/seed.js (writes).
 *
 * Every rowTo*() validates its output with the matching Zod schema outside production,
 * so a schema/DB mismatch fails loudly with the table name instead of silently
 * producing bad data for the engine. Server-only (no secrets here, but only lib/data uses it).
 */
import { z } from "zod";
import { BusyBlock, Friendship, Interaction, Place, Plan, PlanMember, TagWeights, TravelTime, User } from "@/types/domain";
import { isRegistryPlaceId, isVenuePlaceId } from "./registry";

/** @typedef {import("@/types/domain").UserT} UserT */
/** @typedef {import("@/types/domain").FriendshipT} FriendshipT */
/** @typedef {import("@/types/domain").BusyBlockT} BusyBlockT */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").TravelTimeT} TravelTimeT */
/** @typedef {import("@/types/domain").InteractionT} InteractionT */
/** @typedef {import("@/types/domain").TagWeightsT} TagWeightsT */
/** @typedef {import("@/types/domain").PlanT} PlanT */
/** @typedef {import("@/types/domain").PlanMemberT} PlanMemberT */
/** @typedef {Record<string, any>} Row A row as returned by supabase-js. */

const VALIDATE = process.env.NODE_ENV !== "production";

/**
 * Validate `value` against `schema` (outside production) and return it.
 * @template T
 * @param {string} table
 * @param {z.ZodType<T>} schema
 * @param {unknown} value
 * @returns {T}
 */
function check(table, schema, value) {
  if (!VALIDATE) return /** @type {T} */ (value);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`[lib/data/mappers] ${table} row does not match contract:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * Postgres timestamptz ("2026-11-21T19:00:00+00:00") -> ISO UTC with Z ("2026-11-21T19:00:00.000Z").
 * @param {string} value
 * @returns {string}
 */
export function toIso(value) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`[lib/data/mappers] invalid timestamp: ${value}`);
  return new Date(ms).toISOString();
}

// --- users -----------------------------------------------------------------

/** @param {Row} row @returns {UserT} */
export function rowToUser(row) {
  return check("users", User, {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url ?? "",
    homeLat: row.home_lat,
    homeLng: row.home_lng,
    interests: row.interests ?? [],
  });
}

/** @param {UserT} user @returns {Row} */
export function userToRow(user) {
  return {
    id: user.id,
    name: user.name,
    avatar_url: user.avatarUrl,
    home_lat: user.homeLat,
    home_lng: user.homeLng,
    interests: user.interests,
  };
}

// --- friendships -----------------------------------------------------------

/** @param {Row} row @returns {FriendshipT} */
export function rowToFriendship(row) {
  return check("friendships", Friendship, {
    userId: row.user_id,
    friendId: row.friend_id,
    closeness: row.closeness,
  });
}

/** @param {FriendshipT} f @returns {Row} */
export function friendshipToRow(f) {
  return { user_id: f.userId, friend_id: f.friendId, closeness: f.closeness };
}

// --- busy_blocks -----------------------------------------------------------

/** @param {Row} row @returns {BusyBlockT} */
export function rowToBusyBlock(row) {
  return check("busy_blocks", BusyBlock, {
    ...(row.id ? { id: row.id } : {}),
    userId: row.user_id,
    startAt: toIso(row.start_at),
    endAt: toIso(row.end_at),
    source: row.source,
  });
}

/** Omits `id` when absent so the DB default generates one. @param {BusyBlockT} b @returns {Row} */
export function busyBlockToRow(b) {
  return {
    ...(b.id ? { id: b.id } : {}),
    user_id: b.userId,
    start_at: b.startAt,
    end_at: b.endAt,
    source: b.source,
  };
}

// --- places ----------------------------------------------------------------

/** @param {Row} row @returns {PlaceT} */
export function rowToPlace(row) {
  const place = check("places", Place, {
    id: row.id,
    name: row.name,
    category: row.category,
    tags: row.tags ?? [],
    lat: row.lat,
    lng: row.lng,
    address: row.address ?? "",
    priceLevel: row.price_level,
    photoUrl: row.photo_url ?? "",
    hours: row.hours ?? {},
    typicalDurationMin: row.typical_duration_min,
    indoor: row.indoor,
  });
  // Registry restaurants saved for a plan keep their flags (hours are assumed): see lib/data/registry.js.
  if (isRegistryPlaceId(place.id)) return { ...place, source: "registry", hoursVerified: false };
  // OSM venues saved for a plan: hours assumed too (no "osm" in Place.source yet, so no source).
  if (isVenuePlaceId(place.id)) return { ...place, hoursVerified: false };
  return place;
}

/** @param {PlaceT} p @returns {Row} */
export function placeToRow(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    tags: p.tags,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    price_level: p.priceLevel,
    photo_url: p.photoUrl,
    hours: p.hours,
    typical_duration_min: p.typicalDurationMin,
    indoor: p.indoor,
  };
}

// --- travel_times ----------------------------------------------------------

/** @param {Row} row @returns {TravelTimeT} */
export function rowToTravelTime(row) {
  return check("travel_times", TravelTime, {
    userId: row.user_id,
    placeId: row.place_id,
    minutes: row.minutes,
    mode: row.mode,
    isEstimate: row.is_estimate,
  });
}

/** @param {TravelTimeT} t @returns {Row} */
export function travelTimeToRow(t) {
  return {
    user_id: t.userId,
    place_id: t.placeId,
    minutes: t.minutes,
    mode: t.mode,
    is_estimate: t.isEstimate,
  };
}

// --- interactions ----------------------------------------------------------

/** @param {Row} row @returns {InteractionT} */
export function rowToInteraction(row) {
  return check("interactions", Interaction, {
    ...(row.id ? { id: row.id } : {}),
    userId: row.user_id,
    placeId: row.place_id,
    slotStart: toIso(row.slot_start),
    action: row.action,
    createdAt: toIso(row.created_at),
  });
}

/** Omits id/createdAt when absent so DB defaults apply. @param {Partial<InteractionT> & Pick<InteractionT, "userId" | "placeId" | "slotStart" | "action">} i @returns {Row} */
export function interactionToRow(i) {
  return {
    ...(i.id ? { id: i.id } : {}),
    user_id: i.userId,
    place_id: i.placeId,
    slot_start: i.slotStart,
    action: i.action,
    ...(i.createdAt ? { created_at: i.createdAt } : {}),
  };
}

// --- user_tag_weights ------------------------------------------------------

/** Many rows -> one `{ tag: weight }` record. @param {Row[]} rows @returns {TagWeightsT} */
export function rowsToTagWeights(rows) {
  /** @type {TagWeightsT} */
  const weights = {};
  for (const row of rows) weights[row.tag] = row.weight;
  return check("user_tag_weights", TagWeights, weights);
}

/** One record -> rows for upsert. @param {string} userId @param {TagWeightsT} weights @returns {Row[]} */
export function tagWeightsToRows(userId, weights) {
  return Object.entries(weights).map(([tag, weight]) => ({ user_id: userId, tag, weight }));
}

// --- plans / plan_members (for Mhammad's lib/social/plans-store.js, PLAN.md S1) ---

/** @param {Row} row @returns {PlanT} */
export function rowToPlan(row) {
  return check("plans", Plan, {
    id: row.id,
    creatorId: row.creator_id,
    placeId: row.place_id,
    startAt: toIso(row.start_at),
    endAt: toIso(row.end_at),
    status: row.status,
    createdAt: toIso(row.created_at),
  });
}

/** Omits createdAt when absent so the DB default applies. @param {PlanT | Omit<PlanT, "createdAt">} p @returns {Row} */
export function planToRow(p) {
  return {
    id: p.id,
    creator_id: p.creatorId,
    place_id: p.placeId,
    start_at: p.startAt,
    end_at: p.endAt,
    status: p.status,
    ...("createdAt" in p && p.createdAt ? { created_at: p.createdAt } : {}),
  };
}

/** @param {Row} row @returns {PlanMemberT} */
export function rowToPlanMember(row) {
  return check("plan_members", PlanMember, { planId: row.plan_id, userId: row.user_id, rsvp: row.rsvp });
}

/** @param {PlanMemberT} m @returns {Row} */
export function planMemberToRow(m) {
  return { plan_id: m.planId, user_id: m.userId, rsvp: m.rsvp };
}
