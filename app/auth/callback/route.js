/**
 * GET /auth/callback?code=…&next=/feed
 * Google → Supabase → here. Exchanges the one-time code for a session (cookies), then redirects.
 * Owner: Anthony (Part 13). After the exchange, lib/signin.js creates the user row, syncs the
 * calendar (Part 14: the Google provider_token only exists in this response) and sends new
 * users to /onboarding.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, safeNextPath } from "@/lib/auth";
import { afterSignIn } from "@/lib/signin";
import * as data from "@/lib/data";

/**
 * Adel's data functions, looked up by name so this builds before they exist
 * (ensureUser / syncCalendar are picked up automatically once they're exported).
 * @param {string} name
 */
const optional = (name) => {
  const fn = /** @type {Record<string, unknown>} */ (data)[name];
  return typeof fn === "function" ? /** @type {any} */ (fn) : undefined;
};

/** @param {import("next/server").NextRequest} request */
export async function GET(request) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const fail = (reason) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, origin));

  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) return fail(oauthError);
  const code = searchParams.get("code");
  if (!code) return fail("Sign-in was cancelled or the link expired.");

  let session;
  try {
    const supabase = await createClient();
    const { data: auth, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[auth/callback] code exchange failed:", error.message);
      return fail("Sign-in didn't complete. Please try again in the same browser.");
    }
    session = auth.session;
  } catch (e) {
    console.error("[auth/callback]", e);
    return fail("Could not finish signing in. Please try again.");
  }

  // Create the user row if new, sync the calendar (Part 14), and pick /onboarding vs /feed.
  let redirectTo = next;
  try {
    const result = await afterSignIn(
      { authUser: session.user, providerToken: session.provider_token, next },
      { getUser: data.getUser, ensureUser: optional("ensureUser"), syncCalendar: optional("syncCalendar") },
    );
    redirectTo = result.redirectTo;
  } catch (e) {
    // The session is valid: never block sign-in on setup problems. Worst case they land on the feed.
    console.error("[auth/callback] after-sign-in setup failed:", e);
  }

  const response = NextResponse.redirect(new URL(redirectTo, origin));
  // Google sign-in wins over any leftover "log in as" demo cookie in this browser.
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
