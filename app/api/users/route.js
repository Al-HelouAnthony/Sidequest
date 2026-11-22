/**
 * GET /api/users → { users: UserListItem[] }: people I could add as a friend (not me), friends marked.
 * GET /api/users?q=ma → only people whose @username starts with "ma", or a word of whose name does.
 * Owner: Mhammad (search + @usernames added by Anthony). Used by the onboarding friend picker (F9)
 * and the Friends tab search bar.
 * Two separate worlds: demo users (the 5 seeded people) only see each other; real Google accounts
 * only see other real accounts. Only id, name, avatar and @username leave the server: no home
 * location, no interests.
 */
import { getSessionUserId } from "@/lib/auth";
import { getFriends, listUsers } from "@/lib/data";
import { mockUsers } from "@/lib/mocks/users";
import { assignUsernames, matchesQuery } from "@/lib/usernames";

/** The 5 seeded demo people (backup demo world). */
const DEMO_IDS = new Set(mockUsers.map((u) => u.id));
const MAX_QUERY = 30;

/** @param {Request} [request] */
export async function GET(request) {
  const userId = await getSessionUserId();
  const iAmDemo = DEMO_IDS.has(userId);
  const q = (request ? new URL(request.url).searchParams.get("q") ?? "" : "").slice(0, MAX_QUERY);
  const [users, friends] = await Promise.all([listUsers(), getFriends(userId)]);
  const friendIds = new Set(friends.map((f) => f.user.id));
  // Usernames are assigned over everyone (both worlds), so a name is never handed out twice.
  const usernames = assignUsernames(users);
  return Response.json({
    users: users
      .filter((u) => u.id !== userId && DEMO_IDS.has(u.id) === iAmDemo)
      .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, isFriend: friendIds.has(u.id), username: usernames.get(u.id) ?? "" }))
      .filter((u) => matchesQuery(u, q))
      // People to add first, then friends; alphabetical inside each group.
      .sort((a, b) => Number(a.isFriend) - Number(b.isFriend) || a.name.localeCompare(b.name)),
  });
}
