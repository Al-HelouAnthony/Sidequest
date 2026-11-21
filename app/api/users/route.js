/**
 * GET /api/users → { users: UserListItem[] }: everyone I could add as a friend (not me), friends marked.
 * Owner: Mhammad. Used by Oscar's onboarding friend picker (F9).
 * Only id, name and avatar leave the server: no home location, no interests.
 */
import { getSessionUserId } from "@/lib/auth";
import { getFriends, listUsers } from "@/lib/data";

export async function GET() {
  const userId = await getSessionUserId();
  const [users, friends] = await Promise.all([listUsers(), getFriends(userId)]);
  const friendIds = new Set(friends.map((f) => f.user.id));
  return Response.json({
    users: users
      .filter((u) => u.id !== userId)
      .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, isFriend: friendIds.has(u.id) }))
      // People to add first, then friends; alphabetical inside each group.
      .sort((a, b) => Number(a.isFriend) - Number(b.isFriend) || a.name.localeCompare(b.name)),
  });
}
