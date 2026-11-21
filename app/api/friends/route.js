/** GET /api/friends → { friends: FriendView[] }. Owner: Mhammad (POST add-friend comes in the social phase). */
import { getSessionUserId } from "@/lib/auth";
import { getFriends } from "@/lib/data";

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
