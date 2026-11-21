/**
 * Next 16 proxy (formerly middleware). Owner: Anthony (Part 13).
 *  1. Keeps the Supabase session fresh on every request and checks it's VALID (lib/supabase/proxy.js).
 *  2. Real-accounts mode (DEMO_MODE=false): no valid session → pages go to /login, APIs get 401
 *     (so expired/broken sessions never reach a route and crash with 500).
 *  3. Real-accounts mode: valid session but NO users row (deleted, or sign-in setup failed) →
 *     clear the session, pages go to /login (with a message), APIs get 401. Signing in again runs
 *     ensureUser in app/auth/callback, which recreates the row (and re-syncs the calendar).
 * In demo mode (backup world) only step 1 runs.
 */
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { noAccountDecision, routeDecision } from "@/lib/routeGuard";
import { resolveUserId } from "@/lib/auth";
import { USE_MOCK_DATA, userExists } from "@/lib/data";

/** Users known to have a row: skip the DB lookup for 60 s (positive results only). */
const KNOWN_TTL_MS = 60_000;
/** @type {Map<string, number>} userId -> checked at (ms) */
const known = (globalThis.__sqKnownUsers ??= new Map());

/** @param {string} userId */
async function hasUserRow(userId) {
  const at = known.get(userId);
  if (at && Date.now() - at < KNOWN_TTL_MS) return true;
  const exists = await userExists(userId); // fails open: true if Supabase can't answer
  if (exists) known.set(userId, Date.now());
  else known.delete(userId);
  return exists;
}

/**
 * Drop the Supabase session cookies so /login shows the sign-in card instead of bouncing to /feed.
 * @param {import("next/server").NextRequest} request
 * @param {NextResponse | Response} response
 */
function clearSession(request, response) {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) /** @type {NextResponse} */ (response).cookies.delete(c.name);
  }
  return response;
}

/** @param {import("next/server").NextRequest} request */
export async function proxy(request) {
  const { response, signedIn, authUser } = await updateSession(request);
  const demoMode = process.env.DEMO_MODE !== "false";
  const decision = routeDecision({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasSession: signedIn,
    demoMode,
  });
  if (decision.type === "unauthorized") return Response.json({ error: "Not signed in" }, { status: 401 });
  if (decision.type === "redirect") return NextResponse.redirect(new URL(decision.location, request.url));

  // Step 3: signed in with Google, but is there a users row? (Real data only: mock mode has no real accounts.)
  if (!demoMode && signedIn && authUser && !USE_MOCK_DATA) {
    const noRow = noAccountDecision({ pathname: request.nextUrl.pathname, search: request.nextUrl.search });
    if (noRow.type !== "next") {
      const userId = /** @type {string} */ (resolveUserId({ authUser, demoMode: false })); // DEMO_USER_EMAIL → Sam
      if (!(await hasUserRow(userId))) {
        if (noRow.type === "unauthorized") {
          return clearSession(request, NextResponse.json({ error: "No account for this sign-in, please sign in again" }, { status: 401 }));
        }
        return clearSession(request, NextResponse.redirect(new URL(noRow.location, request.url)));
      }
    }
  }
  return response;
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
