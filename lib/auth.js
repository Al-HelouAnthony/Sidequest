/**
 * Who is the current user? Owner: Mhammad (social phase).
 *
 * TODAY (demo mode): reads the `sq_user` cookie set by /api/dev/login-as?id=...,
 * defaulting to the demo user. Lets two browser windows act as two people
 * (needed to demo invites before Google login exists).
 *
 * LATER: replace the body with the Supabase session (lib/supabase/server.js),
 * keeping the demo cookie as a fallback when DEMO_MODE=true.
 *
 * Every route handler calls this. NEVER read a user id from the request body.
 */
import { cookies } from "next/headers";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";

export const DEMO_COOKIE = "sq_user";
export const DEMO_MODE = process.env.DEMO_MODE !== "false";

/** @returns {Promise<string>} the current user's id */
export async function getSessionUserId() {
  if (DEMO_MODE) {
    const store = await cookies();
    const id = store.get(DEMO_COOKIE)?.value;
    if (id && mockUsers.some((u) => u.id === id)) return id;
    return DEMO_USER_ID;
  }
  throw new Error("Supabase auth not wired yet. Set DEMO_MODE=true or implement lib/auth.js.");
}
