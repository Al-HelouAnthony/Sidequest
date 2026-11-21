/**
 * Session refresh for proxy.js (Next 16's name for middleware). Owner: Anthony (Part 13).
 * Standard @supabase/ssr pattern: read cookies from the request, let Supabase refresh an expiring
 * session, and copy any new cookies (+ the no-cache headers it asks for) onto the response.
 * Also reports whether the session is VALID (not just whether a cookie exists), so the proxy can
 * answer 401 / redirect for expired or broken sessions instead of letting routes crash with 500.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * @param {import("next/server").NextRequest} request
 * @returns {Promise<{ response: NextResponse, signedIn: boolean, authUser: { id: string, email: string | null } | null }>}
 */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No Supabase config or no Supabase auth cookie (demo-cookie users): nothing to refresh, not signed in.
  if (!url || !key || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return { response, signedIn: false, authUser: null };

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

  // Refreshes the access token if it's about to expire, and verifies it. Do not remove.
  try {
    const { data, error } = await supabase.auth.getClaims();
    const signedIn = !error && !!data?.claims?.sub;
    return { response, signedIn, authUser: signedIn ? { id: data.claims.sub, email: data.claims.email ?? null } : null };
  } catch {
    return { response, signedIn: false, authUser: null };
  }
}
