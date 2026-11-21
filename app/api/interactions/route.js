/**
 * POST /api/interactions  { placeId, slotStart, action }  →  { ok: true }
 * Owner: Anthony. Records the swipe and updates the user's learned tag weights (Part 10).
 * Oscar's feed calls this fire-and-forget on Skip / Save (and Let's go → "go").
 */
import { InteractionRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { getPlace, getTagWeights, recordInteraction, setTagWeights } from "@/lib/data";
import { applyInteraction } from "@/lib/engine/learning";

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, InteractionRequest);
  if (response) return response;

  // Check first: with the real DB an unknown place would also break the interactions FK.
  const place = await getPlace(data.placeId);
  if (!place) return jsonError(404, "Unknown place");

  await recordInteraction(userId, data);
  const weights = await getTagWeights(userId);
  await setTagWeights(userId, applyInteraction(weights, place, data.action));
  return Response.json({ ok: true });
}
