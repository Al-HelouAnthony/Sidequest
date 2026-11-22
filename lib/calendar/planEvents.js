/**
 * G2: put a plan into a member's Google Calendar on "I'm in", take it out on "Can't make it" / cancel.
 * Server-only. Owner: Anthony (Mhammad's plans-store calls addPlanToCalendar / removePlanFromCalendar).
 *
 * How: the refresh token saved at sign-in (Adel's google_tokens table, scope calendar.events) is
 * exchanged for a short-lived access token, then Calendar API v3 is called on the user's primary
 * calendar. Google endpoints used (standard OAuth 2.0 + Calendar v3):
 *  - POST https://oauth2.googleapis.com/token  grant_type=refresh_token → { access_token, expires_in }
 *  - POST   /calendars/primary/events           → { id }
 *  - DELETE /calendars/primary/events/{eventId} → 204 (404/410 = already gone: fine)
 * Tokens are never logged or sent to the browser. Every function here is safe to call for users who
 * never connected Google (demo users): they return null / do nothing.
 */
import { GOOGLE_TIMEOUT_MS, GoogleCalendarError } from "./google";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const APP_URL = "https://sidequest-two-smoky.vercel.app";

/**
 * @param {string} url @param {RequestInit} init @param {typeof fetch} fetchImpl
 * @returns {Promise<Response>}
 */
async function call(url, init, fetchImpl) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  } catch (e) {
    throw new GoogleCalendarError(e instanceof Error && e.name === "TimeoutError" ? "Google timed out" : "Google request failed");
  }
}

/**
 * A fresh access token for this user, or null when they never connected Google (no refresh token).
 * @param {string} userId
 * @param {{ getRefreshToken: (userId: string) => Promise<string | null>, fetchImpl?: typeof fetch,
 *           clientId?: string, clientSecret?: string }} deps
 * @returns {Promise<string | null>}
 */
export async function accessTokenFor(userId, deps) {
  const refreshToken = await deps.getRefreshToken(userId);
  if (!refreshToken) return null;
  const clientId = deps.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = deps.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GoogleCalendarError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set");
  const res = await call(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    },
    deps.fetchImpl ?? fetch,
  );
  // 400 invalid_grant = revoked or expired (testing-mode tokens last ~7 days): treat as "not connected".
  if (res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new GoogleCalendarError(`Google token ${res.status}`, res.status);
  const body = await res.json();
  return typeof body?.access_token === "string" ? body.access_token : null;
}

/**
 * The calendar event for a plan (what Google shows). Pure, exported for tests.
 * @param {{ id: string, startAt: string, endAt: string, place: { name: string, address: string },
 *           members: { name: string, rsvp: string }[] }} plan
 */
export function planEventBody(plan) {
  const going = plan.members.filter((m) => m.rsvp === "in").map((m) => m.name.split(" ")[0]);
  return {
    summary: `Sidequest: ${plan.place.name}`,
    location: plan.place.address,
    description: `With ${going.join(", ") || "friends"}.\nPlan: ${APP_URL}/plans/${plan.id}`,
    start: { dateTime: plan.startAt },
    end: { dateTime: plan.endAt },
    source: { title: "Sidequest", url: `${APP_URL}/plans/${plan.id}` },
  };
}

/**
 * Create the event; returns Google's event id.
 * @param {string} accessToken @param {Parameters<typeof planEventBody>[0]} plan @param {typeof fetch} [fetchImpl]
 */
export async function insertPlanEvent(accessToken, plan, fetchImpl = fetch) {
  const res = await call(
    EVENTS_URL,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(planEventBody(plan)) },
    fetchImpl,
  );
  if (!res.ok) throw new GoogleCalendarError(`Google Calendar insert ${res.status}`, res.status);
  const body = await res.json();
  if (typeof body?.id !== "string") throw new GoogleCalendarError("Google Calendar insert: no event id");
  return body.id;
}

/**
 * Delete the event; already-deleted (404/410) counts as done.
 * @param {string} accessToken @param {string} eventId @param {typeof fetch} [fetchImpl]
 */
export async function deletePlanEvent(accessToken, eventId, fetchImpl = fetch) {
  const res = await call(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }, fetchImpl);
  if (res.ok || res.status === 404 || res.status === 410) return;
  throw new GoogleCalendarError(`Google Calendar delete ${res.status}`, res.status);
}

/**
 * For plans-store (Mhammad): add the plan to this member's calendar. Returns the Google event id,
 * or null when the user never connected Google (nothing to do).
 * @param {string} userId @param {Parameters<typeof planEventBody>[0]} plan
 * @param {Parameters<typeof accessTokenFor>[1]} deps
 * @returns {Promise<string | null>}
 */
export async function addPlanToCalendar(userId, plan, deps) {
  const token = await accessTokenFor(userId, deps);
  return token ? insertPlanEvent(token, plan, deps.fetchImpl) : null;
}

/**
 * For plans-store (Mhammad): remove a previously added event (no-op without a token).
 * @param {string} userId @param {string} eventId @param {Parameters<typeof accessTokenFor>[1]} deps
 */
export async function removePlanFromCalendar(userId, eventId, deps) {
  const token = await accessTokenFor(userId, deps);
  if (token) await deletePlanEvent(token, eventId, deps.fetchImpl);
}
