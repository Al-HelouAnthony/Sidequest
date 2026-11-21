/**
 * POST /auth/signout → signs out of Google (Supabase) and clears the demo cookie → /login.
 * Owner: Anthony (Part 13). POST only, so a link or image can't sign someone out.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/auth";

/** @param {import("next/server").NextRequest} request */
export async function POST(request) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("[auth/signout]", e instanceof Error ? e.message : e);
  }
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
