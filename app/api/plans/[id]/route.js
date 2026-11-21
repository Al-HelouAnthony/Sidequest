/** GET /api/plans/[id] → { plan: PlanView } (members only). Owner: Mhammad. */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { PlanError, getPlan } from "@/lib/social/plans-store";

/** @param {Request} _req @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(_req, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  try {
    return Response.json({ plan: await getPlan(userId, id) });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
