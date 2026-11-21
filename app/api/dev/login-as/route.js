/**
 * GET /api/dev/login-as?id=<userId>&next=/feed
 * Demo-only "log in as" so two browser windows can be two different people.
 * Disabled when DEMO_MODE=false.
 */
import { NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_MODE } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { mockUsers } from "@/lib/mocks/users";

/** @param {import("next/server").NextRequest} request */
export async function GET(request) {
  if (!DEMO_MODE) return jsonError(404, "Not found");
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !mockUsers.some((u) => u.id === id)) {
    return jsonError(400, "Unknown user id", { valid: mockUsers.map((u) => ({ id: u.id, name: u.name })) });
  }
  const next = request.nextUrl.searchParams.get("next") ?? "/feed";
  const res = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/feed", request.url));
  res.cookies.set(DEMO_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
