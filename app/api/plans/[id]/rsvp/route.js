/** POST /api/plans/[id]/rsvp  { rsvp: "in" | "out" } → { plan: PlanView }. Owner: Mhammad. */
import { RsvpRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { PlanError, setRsvp } from "@/lib/social/plans-store";

/** @param {Request} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function POST(request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  const { data, response } = await parseBody(request, RsvpRequest);
  if (response) return response;
  try {
    return Response.json({ plan: await setRsvp(userId, id, data.rsvp) });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
