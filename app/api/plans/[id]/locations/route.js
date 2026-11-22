/**
 * G5 live location. GET /api/plans/[id]/locations → PlanLocationsResponse. Owner: Mhammad.
 * Per member: status ("sharing" | "arrived" | "late" | "not-sharing") + distanceM / etaMin. NEVER coordinates.
 * Members only (403). Outside the window everyone is "not-sharing"; positions are deleted after the plan.
 */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { PlanError } from "@/lib/social/plans-store";
import { planLocations } from "@/lib/social/locations";

/** @param {Request} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(_request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  try {
    return Response.json({ members: await planLocations(userId, id) });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
