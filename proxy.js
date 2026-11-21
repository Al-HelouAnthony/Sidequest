/**
 * Next 16 proxy (formerly middleware). Owner: Anthony (Part 13).
 *  1. Real-accounts mode (DEMO_MODE=false): not signed in → pages go to /login, APIs get 401.
 *  2. Keeps the Supabase session fresh on every request (lib/supabase/proxy.js).
 * In demo mode (backup world) only step 2 runs.
 */
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { routeDecision } from "@/lib/routeGuard";

/** @param {import("next/server").NextRequest} request */
export async function proxy(request) {
  const decision = routeDecision({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasSession: request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")),
    demoMode: process.env.DEMO_MODE !== "false",
  });
  if (decision.type === "unauthorized") return Response.json({ error: "Not signed in" }, { status: 401 });
  if (decision.type === "redirect") return NextResponse.redirect(new URL(decision.location, request.url));
  return updateSession(request);
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
