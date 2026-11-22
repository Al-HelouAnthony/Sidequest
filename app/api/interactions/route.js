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
import { venuePlaceById } from "@/lib/geo/venues";
import { applyInteraction } from "@/lib/engine/learning";

/**
 * Search-only places (registry restaurants, OpenStreetMap venues) have no `places` row until someone
 * acts on them; the interactions FK needs one. Adel's ensurePlaceFrom… saves it, built server-side by id.
 * Returns null for unknown ids (→ 404).
 * @param {string} placeId
 */
async function ensureSearchPlace(placeId) {
  try {
    return isVenuePlaceId(placeId) ? await ensurePlaceFromVenue(venuePlaceById(placeId)) : await ensurePlaceFromRegistry(placeId);
  } catch {
    return null; // DataInputError: not a known registry restaurant / venue → 404 below
  }
}

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data: body, response } = await parseBody(request, InteractionRequest);
  if (response) return response;

  // Check first: with the real DB an unknown place would also break the interactions FK.
  const place = (await getPlace(body.placeId)) ?? (await ensureSearchPlace(body.placeId));
  if (!place) return jsonError(404, "Unknown place");

  await recordInteraction(userId, body);
  const weights = await getTagWeights(userId);
  await setTagWeights(userId, applyInteraction(weights, place, body.action));
  return Response.json({ ok: true });
}
