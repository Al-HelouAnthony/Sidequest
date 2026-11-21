/** GET /api/me → { user }. */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getUser } from "@/lib/data";

export async function GET() {
  const user = await getUser(await getSessionUserId());
  if (!user) return jsonError(404, "User not found");
  return Response.json({ user });
}
