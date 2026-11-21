/**
 * Who is the current user? Owner: Anthony (Part 13; taken over from Mhammad, same signature).
 *
 * Order (resolveUserId):
 *  1. Demo cookie `sq_user` (set by /api/dev/login-as?id=…), only when DEMO_MODE=true.
 *     An explicit "log in as" choice, e.g. phone 2 = Maya. Google sign-in clears it.
 *  2. Supabase Google session. The account in DEMO_USER_EMAIL maps to Sam (all demo data
 *     lives on Sam's fixed id); any other Google account uses its own auth id.
 *  3. DEMO_MODE=true and nobody signed in → Sam.
 *  Otherwise → UnauthenticatedError.
 *
 * Every route handler calls getSessionUserId(). NEVER read a user id from the request body.
 * If Supabase isn't configured (tests, mock mode) step 2 is skipped silently.
 */
import { cookies } from "next/headers";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";
import { createClient } from "@/lib/supabase/server";

export const DEMO_COOKIE = "sq_user";
export const DEMO_MODE = process.env.DEMO_MODE !== "false";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.status = 401;
  }
}

/**
 * Pure decision, so it can be unit-tested.
 * @param {{ demoCookie?: string | null, authUser?: { id: string, email?: string | null } | null,
 *           demoMode?: boolean, demoEmail?: string | null }} input
 * @returns {string | null}  user id, or null = not signed in
 */
export function resolveUserId({ demoCookie, authUser, demoMode = DEMO_MODE, demoEmail = process.env.DEMO_USER_EMAIL }) {
  if (demoMode && demoCookie && mockUsers.some((u) => u.id === demoCookie)) return demoCookie;
  if (authUser?.id) {
    const isDemoAccount = !!demoEmail && !!authUser.email && authUser.email.trim().toLowerCase() === demoEmail.trim().toLowerCase();
    return isDemoAccount ? DEMO_USER_ID : authUser.id;
  }
  return demoMode ? DEMO_USER_ID : null;
}

/**
 * The signed-in Google user from the Supabase session cookie, or null.
 * getClaims() verifies the JWT; no network call when the project uses asymmetric signing keys.
 * @returns {Promise<{ id: string, email: string | null } | null>}
 */
export async function readAuthUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return { id: data.claims.sub, email: data.claims.email ?? null };
  } catch {
    return null;
  }
}

/** @returns {Promise<string>} the current user's id */
export async function getSessionUserId() {
  const store = await cookies();
  const demoCookie = store.get(DEMO_COOKIE)?.value ?? null;
  // A valid demo cookie decides on its own: skip the Supabase check.
  const cookieDecides = DEMO_MODE && !!demoCookie && mockUsers.some((u) => u.id === demoCookie);
  const authUser = cookieDecides ? null : await readAuthUser();
  const id = resolveUserId({ demoCookie, authUser });
  if (!id) throw new UnauthenticatedError();
  return id;
}

/**
 * Where to go after sign-in. Only paths inside this app (no "//evil.com", no full URLs).
 * @param {string | null | undefined} next
 */
export function safeNextPath(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/feed";
  return next;
}
