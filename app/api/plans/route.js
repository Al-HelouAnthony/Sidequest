/**
 * GET  /api/plans   → { plans: PlanView[] } (upcoming first)
 * POST /api/plans   { placeId, start, end, inviteeIds } → 201 { plan: PlanView }
 * Owner: Mhammad. Works today on the in-memory store (lib/social/plans-store.js).
 */
import { CreatePlanRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { PlanError, createPlan, listPlans } from "@/lib/social/plans-store";

export async function GET() {
  const userId = await getSessionUserId();
  return Response.json({ plans: await listPlans(userId) });
}

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, CreatePlanRequest);
  if (response) return response;
  try {
    return Response.json({ plan: await createPlan(userId, data) }, { status: 201 });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
