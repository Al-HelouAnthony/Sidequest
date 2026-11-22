/**
 * GET   /api/me → { user }
 * PATCH /api/me { postalCode?, neighbourhoodId?, interests? } → { user }   (Oscar's onboarding, F9)
 * Owner: Mhammad. "Me" always comes from getSessionUserId(), never from the body.
 */
import { UpdateMeRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { DataInputError, getUser, listUsers, updateProfile } from "@/lib/data";
import { PostalCodeError, postalCodeToHome } from "@/lib/geo/postalCode";
import { assignUsernames } from "@/lib/usernames";

export async function GET() {
  const userId = await getSessionUserId();
  const [user, everyone] = await Promise.all([getUser(userId), listUsers().catch(() => [])]);
  if (!user) return jsonError(404, "User not found");
  // @username (lib/usernames.js): computed from first names across all users, so it's unique.
  const username = assignUsernames(everyone.some((u) => u.id === user.id) ? everyone : [...everyone, user]).get(user.id);
  return Response.json({ user: { ...user, ...(username ? { username } : {}) } });
}

/**
 * postalCode: only the first 3 characters are kept ("H2T"); its centre becomes the home.
 * neighbourhoodId: the old picker, kept until onboarding switches to postal codes.
 * Takes ~2–3 s when the home moves: Adel's updateProfile recomputes travel times before answering.
 * Bad/unknown postal code, neighbourhood or interest → 400. Postal code lookup down → 503.
 * @param {Request} request
 */
export async function PATCH(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, UpdateMeRequest);
  if (response) return response;
  try {
    const { postalCode, ...rest } = data;
    /** @type {Record<string, unknown>} */
    const patch = { ...rest };
    if (postalCode !== undefined) {
      const { lat, lng } = await postalCodeToHome(postalCode);
      patch.home = { lat, lng }; // coordinates only ever come from the lookup, never from the client
    }
    const user = await updateProfile(userId, patch);
    if (!user) return jsonError(404, "User not found");
    return Response.json({ user });
  } catch (e) {
    if (e instanceof PostalCodeError) return jsonError(e.status, e.message);
    if (e instanceof DataInputError) return jsonError(400, e.message);
    throw e;
  }
}
