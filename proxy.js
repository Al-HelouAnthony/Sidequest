/**
 * Next 16 proxy (formerly middleware). Owner: Anthony (Part 13).
 *  1. Keeps the Supabase session fresh on every request and checks it's VALID (lib/supabase/proxy.js).
 *  2. Real-accounts mode (DEMO_MODE=false): no valid session → pages go to /login, APIs get 401
 *     (so expired/broken sessions never reach a route and crash with 500).
 * In demo mode (backup world) only step 1 runs.
 */
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { routeDecision } from "@/lib/routeGuard";

/** @param {import("next/server").NextRequest} request */
export async function proxy(request) {
  const { response, signedIn } = await updateSession(request);
  const decision = routeDecision({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasSession: signedIn,
    demoMode: process.env.DEMO_MODE !== "false",
  });
  if (decision.type === "unauthorized") return Response.json({ error: "Not signed in" }, { status: 401 });
  if (decision.type === "redirect") return NextResponse.redirect(new URL(decision.location, request.url));
  return response;
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
