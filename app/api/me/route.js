/**
 * GET   /api/me → { user }
 * PATCH /api/me { neighbourhoodId?, interests? } → { user }   (Oscar's onboarding, F9)
 * Owner: Mhammad. "Me" always comes from getSessionUserId(), never from the body.
 */
import { UpdateMeRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { DataInputError, getUser, updateProfile } from "@/lib/data";

export async function GET() {
  const user = await getUser(await getSessionUserId());
  if (!user) return jsonError(404, "User not found");
  return Response.json({ user });
}

/**
 * Takes ~2–3 s when the home moves: Adel's updateProfile recomputes travel times before answering.
 * Unknown neighbourhood or interest → 400 (DataInputError from updateProfile).
 * @param {Request} request
 */
export async function PATCH(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, UpdateMeRequest);
  if (response) return response;
  try {
    const user = await updateProfile(userId, data);
    if (!user) return jsonError(404, "User not found");
    return Response.json({ user });
  } catch (e) {
    if (e instanceof DataInputError) return jsonError(400, e.message);
    throw e;
  }
}
