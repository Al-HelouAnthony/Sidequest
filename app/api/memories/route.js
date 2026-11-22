/**
 * GET /api/memories → MemoriesResponse: every memory photo from every plan I'm in, grouped by plan,
 * newest plan first. Used by the Memories screen (components/memories/MemoriesScreen.jsx).
 * Same rule as the plan album: only plans I'm a member of; signed URLs (≈1 h) on Supabase.
 */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { PlanError } from "@/lib/social/plans-store";
import { memoriesOf } from "@/lib/social/photos";

export async function GET() {
  const userId = await getSessionUserId();
  try {
    return Response.json({ memories: await memoriesOf(userId) });
  } catch (e) {
    if (e instanceof PlanError) return jsonError(e.status, e.message);
    throw e;
  }
}
