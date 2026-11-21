/**
 * POST /api/plans/[id]/cancel (no body) → { plan: PlanView }. Owner: Mhammad.
 * Oscar's "Cancel plan" on the plan screen (organizer only). Once cancelled, a plan stays cancelled.
 * Already cancelled → 200 (idempotent). Not the organizer / not a member → 403. Missing plan → 404.
 */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { PlanError, cancelPlan } from "@/lib/social/plans-store";

/** @param {Request} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function POST(_request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  try {
    return Response.json({ plan: await cancelPlan(userId, id) });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
