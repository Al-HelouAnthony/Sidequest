/**
 * Part 14: Google Calendar → busy_blocks. Server-only. Owner: Anthony.
 *
 * Runs at every Google sign-in (app/auth/callback → lib/signin.js): the Google access token
 * (session.provider_token) only exists there. Reads ONLY free/busy, never event titles.
 *
 * Google Calendar API v3 (checked against Google's reference docs):
 *  - GET  /users/me/calendarList  → items[] { id, primary?, selected?, hidden?, deleted? }, nextPageToken
 *  - POST /freeBusy { timeMin, timeMax, timeZone, items: [{ id }] }  (max 50 calendars)
 *         → calendars[id] { busy: [{ start, end }], errors?: [{ domain, reason }] }
 * Both accept the calendar.readonly scope requested at sign-in.
 */
import { BusyBlock, TIMEZONE } from "@/types/domain";

const API = "https://www.googleapis.com/calendar/v3";
/** Never let Google slow the sign-in down for long. */
export const GOOGLE_TIMEOUT_MS = 5000;
/** How far ahead we read (the engine looks 7 days ahead; 14 gives slack). */
export const SYNC_DAYS = 14;
/** freeBusy accepts at most 50 calendars per request. */
const MAX_CALENDARS = 50;
const MAX_LIST_PAGES = 4;

export class GoogleCalendarError extends Error {
  /** @param {string} message @param {number} [status] */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {string} url @param {string} token @param {RequestInit} [init] @param {typeof fetch} [fetchImpl]
 */
async function googleJson(url, token, init = {}, fetchImpl = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new GoogleCalendarError(`Google Calendar ${res.status}`, res.status);
    return await res.json();
  } catch (e) {
    if (e instanceof GoogleCalendarError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new GoogleCalendarError("Google Calendar timed out");
    throw new GoogleCalendarError(e instanceof Error ? e.message : "Google Calendar request failed");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "All ticked calendars": not deleted, not hidden, and primary or selected (ticked in Google Calendar).
 * Falls back to ["primary"] if nothing qualifies. Capped at 50 (freeBusy limit).
 * @param {{ id?: string, primary?: boolean, selected?: boolean, hidden?: boolean, deleted?: boolean }[]} items
 * @returns {string[]}
 */
export function pickCalendarIds(items) {
  const ids = items
    .filter((c) => c.id && !c.deleted && !c.hidden && (c.primary || c.selected))
    .map((c) => /** @type {string} */ (c.id));
  const unique = [...new Set(ids)];
  return unique.length ? unique.slice(0, MAX_CALENDARS) : ["primary"];
}

/** @param {string} token @param {typeof fetch} [fetchImpl] */
export async function listCalendarIds(token, fetchImpl) {
  const items = [];
  let pageToken;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const q = new URLSearchParams({ maxResults: "250", ...(pageToken ? { pageToken } : {}) });
    const body = await googleJson(`${API}/users/me/calendarList?${q}`, token, {}, fetchImpl);
    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return pickCalendarIds(items);
}

/**
 * Pure: Google's freeBusy reply → merged BusyBlocks (source "google") inside [range.start, range.end).
 * Calendars that report errors are skipped (and listed), never guessed.
 * @param {string} userId
 * @param {{ calendars?: Record<string, { busy?: { start: string, end: string }[], errors?: unknown[] }> }} reply
 * @param {{ start: string, end: string }} range
 * @returns {{ blocks: import("@/types/domain").BusyBlockT[], skippedCalendars: string[] }}
 */
export function toBusyBlocks(userId, reply, range) {
  const from = Date.parse(range.start);
  const to = Date.parse(range.end);
  const skippedCalendars = [];
  /** @type {[number, number][]} */
  const spans = [];
  for (const [id, cal] of Object.entries(reply.calendars ?? {})) {
    if (cal.errors?.length) {
      skippedCalendars.push(id);
      continue;
    }
    for (const b of cal.busy ?? []) {
      const s = Math.max(Date.parse(b.start), from);
      const e = Math.min(Date.parse(b.end), to);
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) spans.push([s, e]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  /** @type {[number, number][]} */
  const merged = [];
  for (const [s, e] of spans) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const blocks = merged.map(([s, e]) =>
    BusyBlock.parse({ userId, startAt: new Date(s).toISOString(), endAt: new Date(e).toISOString(), source: "google" }),
  );
  return { blocks, skippedCalendars };
}

/**
 * Full sync for one user: calendars → freeBusy → blocks → save (Adel's replaceBusyBlocks).
 * @param {string} userId
 * @param {string} token  Google access token (session.provider_token)
 * @param {{ now?: Date, fetchImpl?: typeof fetch,
 *           save?: (userId: string, blocks: import("@/types/domain").BusyBlockT[], source: "google") => Promise<unknown> }} [opts]
 * @returns {Promise<{ imported: number, calendars: number, skippedCalendars: string[] }>}
 */
export async function syncCalendar(userId, token, opts = {}) {
  if (!opts.save) throw new GoogleCalendarError("Saving busy blocks isn't available yet (replaceBusyBlocks missing in lib/data)");
  const now = opts.now ?? new Date();
  const range = { start: now.toISOString(), end: new Date(now.getTime() + SYNC_DAYS * 86_400_000).toISOString() };

  const ids = await listCalendarIds(token, opts.fetchImpl);
  const reply = await googleJson(
    `${API}/freeBusy`,
    token,
    { method: "POST", body: JSON.stringify({ timeMin: range.start, timeMax: range.end, timeZone: TIMEZONE, items: ids.map((id) => ({ id })) }) },
    opts.fetchImpl,
  );
  const { blocks, skippedCalendars } = toBusyBlocks(userId, reply, range);
  await opts.save(userId, blocks, "google");
  return { imported: blocks.length, calendars: ids.length, skippedCalendars };
}
