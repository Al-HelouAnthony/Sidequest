/**
 * POST /api/interactions  { placeId, slotStart, action }  →  { ok: true }
 * Owner: Anthony. Records the swipe and updates the user's learned tag weights (Part 10).
 * Oscar's feed calls this fire-and-forget on Skip / Save (and Let's go → "go").
 */
import { InteractionRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { getPlace, getTagWeights, recordInteraction, setTagWeights } from "@/lib/data";
import * as data from "@/lib/data";
import { applyInteraction } from "@/lib/engine/learning";

/**
 * N1: a registry restaurant (from a cuisine search) has no `places` row until someone acts on it.
 * Adel's ensurePlaceFromRegistry() rebuilds it from the registry and saves it (the FK needs it).
 * Returns null for unknown / non-registry ids, or before Adel's N1 code is merged.
 * @param {string} placeId
 */
async function ensureRegistryPlace(placeId) {
  const ensure = /** @type {any} */ (data).ensurePlaceFromRegistry;
  if (typeof ensure !== "function") return null;
  try {
    return await ensure(placeId);
  } catch {
    return null; // DataInputError: not an open registry restaurant → 404 below
  }
}

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data: body, response } = await parseBody(request, InteractionRequest);
  if (response) return response;

  // Check first: with the real DB an unknown place would also break the interactions FK.
  const place = (await getPlace(body.placeId)) ?? (await ensureRegistryPlace(body.placeId));
  if (!place) return jsonError(404, "Unknown place");

  await recordInteraction(userId, body);
  const weights = await getTagWeights(userId);
  await setTagWeights(userId, applyInteraction(weights, place, body.action));
  return Response.json({ ok: true });
}
