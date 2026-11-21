/**
 * GET /auth/callback?code=…&next=/feed
 * Google → Supabase → here. Exchanges the one-time code for a session (cookies), then redirects.
 * Owner: Anthony (Part 13). Part 14 (calendar sync) hooks in where marked: the Google
 * provider_token only exists in this response.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, safeNextPath } from "@/lib/auth";

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[auth/callback] code exchange failed:", error.message);
      return fail("Sign-in didn't complete. Please try again in the same browser.");
    }
    session = data.session;
  } catch (e) {
    console.error("[auth/callback]", e);
    return fail("Could not finish signing in. Please try again.");
  }

  // TODO(Part 14): if (session?.provider_token) sync Google free/busy → busy_blocks here.
  void session;

  const response = NextResponse.redirect(new URL(next, origin));
  // Google sign-in wins over any leftover "log in as" demo cookie in this browser.
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
