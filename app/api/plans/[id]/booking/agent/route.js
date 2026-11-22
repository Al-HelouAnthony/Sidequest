/**
 * GET /api/plans/[id]/booking/agent → BookingAgentResult. Owner: Anthony (N4 booking assistant).
 * Any member of the plan. Reads the place's official website (lib/booking/agent.js): precomputed or
 * cached answers come back instantly; a live read can take ~10 s, so the sheet loads it separately.
 * Not a member → 403, missing plan → 404. Never 500 for a website/Claude problem: verdict "unknown".
 */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getPlace } from "@/lib/data";
import { bookingAgent } from "@/lib/booking/agent";
import { PlanError, getPlan } from "@/lib/social/plans-store";

/** Website fetch (≤ 2 pages) + one Claude call. */
export const maxDuration = 40;

/** @param {Request} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(_request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  try {
    const plan = await getPlan(userId, id); // membership check
    // The full place (events carry source, tags, eventUrl); the plan's summary as a fallback.
    const place = (await getPlace(plan.placeId)) ?? plan.place;
    return Response.json(await bookingAgent(place));
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
