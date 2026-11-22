/**
 * G5 live location. POST /api/plans/[id]/location { lat, lng, accuracyM } → { ok: true }. Owner: Mhammad.
 * Oscar's "Share my location until we meet" (LiveLocation.jsx), opt-in, about every 15 s.
 * Members only (403); only from 30 min before to 30 min after the start (409); ≤ 1 per 15 s (429).
 * Never 404 for a normal case (Oscar's UI reads 404/405 as "not live").
 */
import { LocationRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { PlanError } from "@/lib/social/plans-store";
import { shareLocation } from "@/lib/social/locations";

/** @param {Request} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function POST(request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  const { data, response } = await parseBody(request, LocationRequest);
  if (response) return response;
  try {
    await shareLocation(userId, id, data);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
