/**
 * N4 "Book it". Owner: Anthony (in Mhammad's plans folder, agreed).
 * GET  /api/plans/[id]/booking → BookingInfo (any member): party size, open check, links, FR/EN message.
 * POST /api/plans/[id]/booking (no body) → { plan: PlanView }: the organizer marks it "requested".
 *   Not a member / not the organizer → 403, plan not confirmed → 409, missing → 404.
 */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getPlace } from "@/lib/data";
import { bookingInfo } from "@/lib/booking";
import { PlanError, getPlan, requestBooking } from "@/lib/social/plans-store";

/** @param {Request} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(_request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  try {
    const plan = await getPlan(userId, id); // membership check
    const place = await getPlace(plan.placeId);
    if (!place) return jsonError(404, "Place not found");
    return Response.json(bookingInfo(plan, place));
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}

/** @param {Request} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function POST(_request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  try {
    return Response.json({ plan: await requestBooking(userId, id) });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
