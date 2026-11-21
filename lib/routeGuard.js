/**
 * Optimistic route protection for proxy.js (Next 16 proxy). Owner: Anthony.
 * Only active when DEMO_MODE=false (real-accounts mode). In demo mode everything passes,
 * so the seeded backup world (Sam / "log in as") keeps working.
 *
 * "Optimistic" = based on whether a Supabase auth cookie exists. The real check is still
 * getSessionUserId() in every route handler.
 */

/** Paths anyone can open without a session. */
const PUBLIC = [/^\/login(\/|$)/, /^\/auth\//];

/**
 * @param {{ pathname: string, search?: string, hasSession: boolean, demoMode: boolean }} input
 * @returns {{ type: "next" } | { type: "redirect", location: string } | { type: "unauthorized" }}
 */
export function routeDecision({ pathname, search = "", hasSession, demoMode }) {
  if (demoMode) return { type: "next" };
  if (hasSession) {
    // Already signed in: the login page just forwards to the feed.
    return /^\/login(\/|$)/.test(pathname) ? { type: "redirect", location: "/feed" } : { type: "next" };
  }
  if (PUBLIC.some((re) => re.test(pathname))) return { type: "next" };
  if (pathname.startsWith("/api/")) return { type: "unauthorized" };
  return { type: "redirect", location: `/login?next=${encodeURIComponent(pathname + search)}` };
}
