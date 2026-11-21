/**
 * What happens right after a Google sign-in (called by app/auth/callback). Owner: Anthony.
 *
 *  1. Who is this? (resolveUserId: DEMO_USER_EMAIL → Sam, otherwise the Google account's own id)
 *  2. Make sure a users row exists (Adel's ensureUser, once it exists). Sam is never re-created.
 *  3. Sync Google Calendar busy times (Part 14), if a sync function + Google token are available.
 *     A sync failure NEVER blocks sign-in. Never for the demo account (Sam stays seeded).
 *  4. Where to go: no interests saved yet = new user → /onboarding, otherwise → `next` (/feed).
 *
 * Dependencies are injected so this is testable without Supabase or Google.
 */
import { DEMO_USER_ID } from "@/lib/mocks/users";
import { resolveUserId, safeNextPath } from "@/lib/auth";

/**
 * @typedef {object} SignInDeps
 * @property {(id: string) => Promise<import("@/types/domain").UserT | null>} getUser
 * @property {((u: { id: string, name: string, avatarUrl: string }) => Promise<unknown>) | undefined} [ensureUser]
 * @property {((userId: string, providerToken: string) => Promise<{ imported: number }>) | undefined} [syncCalendar]
 */

/**
 * @param {{ authUser: { id: string, email?: string | null, user_metadata?: Record<string, any> },
 *           providerToken?: string | null, next?: string | null }} input
 * @param {SignInDeps} deps
 * @returns {Promise<{ userId: string, redirectTo: string, isNew: boolean, calendar: "synced" | "skipped" | "failed", imported: number }>}
 */
export async function afterSignIn({ authUser, providerToken, next }, deps) {
  // demoMode false: here we only map the Google account (no demo cookie involved).
  const userId = /** @type {string} */ (resolveUserId({ authUser, demoMode: false }));
  const isDemoAccount = userId === DEMO_USER_ID;

  if (!isDemoAccount && deps.ensureUser) {
    const meta = authUser.user_metadata ?? {};
    await deps.ensureUser({
      id: userId,
      name: String(meta.full_name ?? meta.name ?? authUser.email?.split("@")[0] ?? "New friend").slice(0, 60),
      avatarUrl: String(meta.avatar_url ?? meta.picture ?? ""),
    });
  }

  let calendar = /** @type {"synced" | "skipped" | "failed"} */ ("skipped");
  let imported = 0;
  // Backup mode decision: the demo account maps to seeded Sam, whose schedule stays fake & predictable.
  if (deps.syncCalendar && providerToken && !isDemoAccount) {
    try {
      const result = await deps.syncCalendar(userId, providerToken);
      imported = result.imported;
      calendar = "synced";
      // Counts only, never event details: makes "synced but 0 blocks" easy to diagnose.
      console.info("[signin] calendar synced:", JSON.stringify({ userId, ...result }));
    } catch (e) {
      console.warn("[signin] calendar sync failed (sign-in continues):", e instanceof Error ? e.message : e);
      calendar = "failed";
    }
  }

  const user = await deps.getUser(userId);
  const isNew = !user || !(user.interests?.length > 0);
  const target = safeNextPath(next);
  const redirectTo = isNew ? `/onboarding?next=${encodeURIComponent(target)}&calendar=${calendar}` : target;
  return { userId, redirectTo, isNew, calendar, imported };
}
