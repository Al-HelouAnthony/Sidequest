/**
 * POST /api/interactions  { placeId, slotStart, action }  →  { ok: true }
 * Owner: Anthony. Records the swipe and updates the user's learned tag weights (Part 10).
 * Oscar's feed calls this fire-and-forget on Skip / Save (and Let's go → "go").
 */
import { InteractionRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import {
  ensurePlaceFromRegistry,
  ensurePlaceFromVenue,
  getPlace,
  getTagWeights,
  isVenuePlaceId,
  recordInteraction,
  setTagWeights,
} from "@/lib/data";
import * as data from "@/lib/data";
import { venuePlaceById } from "@/lib/geo/venues";
import { applyInteraction } from "@/lib/engine/learning";

/**
 * City event (Adel's events data layer): saved as a places row from the server's own event lookup.
 * null when it isn't an event id, or before Adel's event functions are merged.
 * @param {string} placeId
 */
async function ensureEventPlace(placeId) {
  /** @type {any} */
  let d;
  try {
    d = { isEvent: /** @type {any} */ (data).isEventPlaceId, byId: /** @type {any} */ (data).eventPlaceById, ensure: /** @type {any} */ (data).ensurePlaceFromEvent };
  } catch {
    return null; // a module mock without them (tests) or not merged yet
  }
  if (typeof d.isEvent !== "function" || !d.isEvent(placeId)) return null;
  return d.ensure(await d.byId(placeId));
}

/**
 * Search-only places (registry restaurants, OpenStreetMap venues, city events) have no `places` row
 * until someone acts on them; the interactions FK needs one. Adel's ensurePlaceFrom… saves it, built
 * server-side by id. Returns null for unknown ids (→ 404).
 * @param {string} placeId
 */
async function ensureSearchPlace(placeId) {
  try {
    if (isVenuePlaceId(placeId)) return await ensurePlaceFromVenue(venuePlaceById(placeId));
    return (await ensureEventPlace(placeId)) ?? (await ensurePlaceFromRegistry(placeId));
  } catch {
    return null; // DataInputError: not a known registry restaurant / venue / event → 404 below
  }
}

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data: body, response } = await parseBody(request, InteractionRequest);
  if (response) return response;

  // Check first: with the real DB an unknown place would also break the interactions FK.
  // City events: getPlace() finds them in the events table even before they have a `places` row, so
  // always save first (idempotent upsert); the interactions FK needs the row.
  const event = await ensureEventPlace(body.placeId).catch(() => null);
  const place = event ?? (await getPlace(body.placeId)) ?? (await ensureSearchPlace(body.placeId));
  if (!place) return jsonError(404, "Unknown place");

  await recordInteraction(userId, body);
  const weights = await getTagWeights(userId);
  await setTagWeights(userId, applyInteraction(weights, place, body.action));
  return Response.json({ ok: true });
}
