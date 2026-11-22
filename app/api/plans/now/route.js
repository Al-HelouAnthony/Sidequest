/**
 * POST /api/plans/now (no body) → 201 { plan: PlanView } | 409 "Nobody's free in the next hour".
 * "Start a sidequest now". Owner: Anthony (in Mhammad's plans folder, agreed).
 * Picks the best of our places for a plan starting in ~10 min (lib/engine/rightNow.js: open, reachable,
 * friends really free) and creates it with the normal createPlan(): same membership/busy checks, live
 * invite on the friends' phones, Google Calendar on confirm. Because it starts so soon, live location
 * and memory photos are available right away: the way to show them at any time.
 * The user always comes from the session; nothing is read from the request.
 */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { nowLocal } from "@/lib/time";
import { loadContext } from "@/lib/engine/load";
import { pickRightNow, rightNowWindow } from "@/lib/engine/rightNow";
import { PlanError, createPlan } from "@/lib/social/plans-store";

export async function POST() {
  const userId = await getSessionUserId();
  const now = nowLocal();
  const ctx = await loadContext(userId, now);
  if (!ctx) return jsonError(404, "User not found");

  const { startMs, endMs } = rightNowWindow(now.toMillis());
  const pick = pickRightNow(ctx, startMs, endMs);
  if (!pick) return jsonError(409, "Nobody's free in the next hour (or nothing nearby is open). Try again later.");

  try {
    const plan = await createPlan(userId, {
      placeId: pick.place.id,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      inviteeIds: pick.friendIds,
    });
    return Response.json({ plan }, { status: 201 });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
