/**
 * Optimistic route protection for proxy.js (Next 16 proxy). Owner: Anthony.
 * Only active when DEMO_MODE=false (real-accounts mode). In demo mode everything passes,
 * so the seeded backup world (Sam / "log in as") keeps working.
 *
 * "Optimistic" = based on whether a Supabase auth cookie exists. The real check is still
 * getSessionUserId() in every route handler.
 */

/** Paths anyone can open without a session. */
// The PWA manifest must be public: the browser fetches it without cookies, and a redirect to /login served
// HTML instead ("Manifest: Line: 1, column: 1, Syntax error" in the console, broken Add to Home Screen).
const PUBLIC = [/^\/login(\/|$)/, /^\/auth\//, /^\/manifest\.webmanifest$/];

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

/** Shown on /login when a signed-in account had no users row (e.g. it was deleted). */
export const NO_ACCOUNT_MESSAGE = "Your account needs to be set up again. Please sign in with Google.";

/**
 * Real-accounts mode: the Google session is valid but there's no users row (deleted, or sign-in
 * setup failed). Pages go back to /login (the proxy also clears the session, so /login doesn't
 * bounce to /feed); signing in again runs ensureUser and recreates the row. APIs get a 401.
 * /login and /auth/* always pass: the sign-in callback is what creates the row.
 * @param {{ pathname: string, search?: string }} input
 * @returns {{ type: "next" } | { type: "redirect", location: string } | { type: "unauthorized" }}
 */
export function noAccountDecision({ pathname, search = "" }) {
  if (PUBLIC.some((re) => re.test(pathname))) return { type: "next" };
  if (pathname.startsWith("/api/")) return { type: "unauthorized" };
  const next = encodeURIComponent(pathname + search);
  return { type: "redirect", location: `/login?next=${next}&error=${encodeURIComponent(NO_ACCOUNT_MESSAGE)}` };
}
