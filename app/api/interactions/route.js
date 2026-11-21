/**
 * POST /api/interactions  { placeId, slotStart, action }  →  { ok: true }
 * Owner: Anthony. STUB: records the interaction. TODO: update tag weights (lib/engine/learning.js).
 */
import { InteractionRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { recordInteraction } from "@/lib/data";

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, InteractionRequest);
  if (response) return response;
  await recordInteraction(userId, data);
  return Response.json({ ok: true });
}
