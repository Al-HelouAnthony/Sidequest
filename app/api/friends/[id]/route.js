/**
 * DELETE /api/friends/[id] → { ok: true }. Owner: Mhammad.
 * Oscar's "Remove friend" (You tab + friend picker). Removes the friendship both ways with Adel's
 * removeFriendship(me, id). Plans already made together stay.
 * Idempotent: not friends / unknown user → still 200. Never 404 for a normal outcome: Oscar's UI
 * reads 404/405 as "endpoint not live yet".
 */
import * as data from "@/lib/data";
import { Id } from "@/types/domain";
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";

/** Looked up by name so the build passes before Adel's function is merged (it's on its way). */
const REMOVE_FRIENDSHIP = "removeFriendship";

/** @param {Request} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function DELETE(_request, { params }) {
  const me = await getSessionUserId();
  const { id } = await params;
  if (!Id.safeParse(id).success) return jsonError(400, "Invalid user id");
  if (id === me) return jsonError(400, "You can't remove yourself");

  /** @type {((a: string, b: string) => Promise<void>) | undefined} */
  const removeFriendship = /** @type {any} */ (data)[REMOVE_FRIENDSHIP];
  // Until Adel's removeFriendship is merged: 405 = what Oscar's UI shows as "isn't available yet".
  if (typeof removeFriendship !== "function") return jsonError(405, "Removing friends isn't available yet");

  try {
    await removeFriendship(me, id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof data.DataInputError) return jsonError(400, e.message);
    throw e;
  }
}
