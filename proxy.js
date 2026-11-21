/**
 * Next 16 proxy (formerly middleware): keeps the Supabase session fresh on every request.
 * Owner: Anthony (Part 13). See lib/supabase/proxy.js.
 */
import { updateSession } from "@/lib/supabase/proxy";

/** @param {import("next/server").NextRequest} request */
export async function proxy(request) {
  return updateSession(request);
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
