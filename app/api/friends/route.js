/**
 * GET  /api/friends → { friends: FriendView[] }
 * POST /api/friends { friendId, closeness? } → { ok: true }   (Oscar's onboarding friend picker, F9)
 * Owner: Mhammad. "Me" always comes from getSessionUserId(), never from the body.
 */
import { AddFriendRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { DataInputError, addFriendship, getFriends, getUser } from "@/lib/data";

export async function GET() {
  const userId = await getSessionUserId();
  const friends = await getFriends(userId);
  return Response.json({
    friends: friends.map(({ user, closeness }) => ({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      closeness,
    })),
  });
}

/**
 * Friends both ways (Adel's addFriendship). Adding someone who is already a friend is fine (no change).
 * @param {Request} request
 */
export async function POST(request) {
  const me = await getSessionUserId();
  const { data, response } = await parseBody(request, AddFriendRequest);
  if (response) return response;
  if (data.friendId === me) return jsonError(400, "You can't add yourself");
  if (!(await getUser(data.friendId))) return jsonError(404, "User not found");
  try {
    await addFriendship(me, data.friendId, data.closeness);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof DataInputError) return jsonError(400, e.message);
    throw e;
  }
}
