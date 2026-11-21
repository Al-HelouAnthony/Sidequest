/**
 * Session refresh for proxy.js (Next 16's name for middleware). Owner: Anthony (Part 13).
 * Standard @supabase/ssr pattern: read cookies from the request, let Supabase refresh an expiring
 * session, and copy any new cookies (+ the no-cache headers it asks for) onto the response.
 * No redirects here: route protection stays in the route handlers (getSessionUserId).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/** @param {import("next/server").NextRequest} request */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Nothing to refresh without Supabase config or without a Supabase auth cookie (demo cookie users).
  if (!url || !key || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Triggers the refresh if the access token is about to expire. Do not remove.
  await supabase.auth.getClaims();
  return response;
}
