/**
 * City events (public.events, source montreal_open_data) → Place objects for the feed. Owner: Adel.
 * Pure functions (no I/O): index.js / db.js do the fetching. Format agreed with Anthony (engine):
 *  - id "50000000-0000-4000-8000-<last 12 hex of events.id>" (events.place_key, migration 0006),
 *    above REGISTRY_ID_MIN, so a saved event never joins the normal feed;
 *  - category "event", source "event", eventUrl = the montreal.ca page;
 *  - one-off event (≤ 12 h): hours = ONLY that weekday, open = start floored to :00/:30,
 *    close = end ceiled; typicalDurationMin = close − open; startsAt = exact start; hoursVerified true;
 *  - multi-day (exhibitions…): every day it runs inside the range, 11:00–17:00 (or its own daily
 *    times when they make sense), 60 min, hoursVerified false, no startsAt (no single start).
 * Events without an exact start (start_at null) are skipped.
 */
import { DateTime } from "luxon";
import { Place } from "@/types/domain";
import { toLocal, weekdayKey } from "@/lib/time";
import { keepEvent } from "./eventRules";
import { haversineKm } from "./geo";

/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").TimeRangeT} TimeRangeT */
/**
 * @typedef {{ id: string, title: string, url?: string | null, event_type?: string | null, audience?: string | null,
 *   setting?: string | null, is_free?: boolean | null, start_date?: string, end_date?: string,
 *   start_at?: string | null, end_at?: string | null, venue_name?: string | null, address?: string | null,
 *   lat?: number | null, lng?: number | null }} EventRow
 */
/** @typedef {PlaceT & { source: "event", hoursVerified: boolean, startsAt?: string, eventUrl?: string }} EventPlaceT */

const ID_PREFIX = "50000000-0000-4000-8000-";
export const EVENT_ID_RE = /^50000000-0000-4000-8000-([0-9a-f]{12})$/;
/** @param {string} id */
export const isEventPlaceId = (id) => EVENT_ID_RE.test(String(id));
/** @param {string} eventUuid events.id */
export const eventPlaceIdFor = (eventUuid) => ID_PREFIX + String(eventUuid).slice(-12).toLowerCase();
/** @param {string} placeId @returns {string | null} events.place_key */
export const eventKeyFrom = (placeId) => EVENT_ID_RE.exec(String(placeId))?.[1] ?? null;

/** How each event type looks: tags (interest vocabulary + search words) and fallback photo. */
const TYPE_STYLE = {
  Musique: { tags: ["live-music", "music", "concert"], photo: "music" },
  Théâtre: { tags: ["art", "theatre"], photo: "arts" },
  Cinéma: { tags: ["art", "cinema", "movies"], photo: "event" },
  Danse: { tags: ["art", "dance"], photo: "arts" },
  Exposition: { tags: ["art", "museums", "exhibition"], photo: "arts" },
  "Fête et marché": { tags: ["markets", "festival"], photo: "event" },
  Humour: { tags: ["comedy"], photo: "event" },
  Cirque: { tags: ["art", "circus"], photo: "arts" },
  "Art de la parole": { tags: ["art", "spoken word"], photo: "arts" },
  Jeux: { tags: ["games"], photo: "event" },
  "Sport et plein air": { tags: ["outdoors", "sports"], photo: "event" },
};

const hhmm = (dt) => dt.toFormat("HH:mm");
const floor30 = (dt) => dt.set({ minute: dt.minute < 30 ? 0 : 30, second: 0, millisecond: 0 });
/** Up to the next :00/:30 (unchanged when already exactly on one). */
const ceil30 = (dt) => {
  const f = floor30(dt);
  return +f === +dt ? f : f.plus({ minutes: 30 });
};

/**
 * One events row → a Place for the feed, or null (no exact start, no location, not active in `range`).
 * @param {EventRow} row
 * @param {TimeRangeT} range only the part of the event inside this range counts (multi-day weekdays)
 * @returns {EventPlaceT | null}
 */
export function eventRowToPlace(row, range) {
  if (!row?.start_at || row.lat == null || row.lng == null) return null;
  const start = toLocal(row.start_at);
  const end = row.end_at ? toLocal(row.end_at) : start.plus({ hours: 2 });
  if (!start.isValid || !end.isValid || end <= start) return null;
  const rStart = toLocal(range.start);
  const rEnd = toLocal(range.end);
  if (!(start < rEnd && end > rStart)) return null;

  const style = TYPE_STYLE[row.event_type ?? ""] ?? { tags: [], photo: "event" };
  const multiDay = end.diff(start, "minutes").minutes > 12 * 60;
  /** @type {Record<string, { open: string, close: string }[]>} */
  const hours = {};
  let typicalDurationMin;
  if (!multiDay) {
    const open = floor30(start);
    const close = ceil30(end);
    hours[weekdayKey(start)] = [{ open: hhmm(open), close: hhmm(close) }];
    typicalDurationMin = Math.max(30, Math.round(close.diff(open, "minutes").minutes));
  } else {
    // Its own daily times when they look like opening hours (e.g. 10:00 → 18:00), else 11:00–17:00.
    const clockOpen = floor30(start);
    const clockClose = ceil30(end.set({ year: start.year, month: start.month, day: start.day }));
    const clockMin = clockClose.diff(clockOpen, "minutes").minutes;
    const own = row.event_type !== "Exposition" && clockMin >= 60 && clockMin <= 600;
    const window = own ? { open: hhmm(clockOpen), close: hhmm(clockClose) } : { open: "11:00", close: "17:00" };
    typicalDurationMin = own ? Math.min(120, Math.round(clockMin)) : 60;
    const from = (start > rStart ? start : rStart).startOf("day");
    const to = end < rEnd ? end : rEnd;
    for (let d = from, i = 0; d < to && i < 7; d = d.plus({ days: 1 }), i++) hours[weekdayKey(d)] = [window];
    if (!Object.keys(hours).length) return null;
  }

  const tags = [...style.tags, ...(row.is_free ? ["free"] : []), ...(row.setting === "À l'extérieur" ? ["outdoors"] : [])];
  const address = [row.venue_name, row.address].filter((s) => s && String(s).trim()).join(", ") || "Montréal";
  const place = Place.parse({
    id: eventPlaceIdFor(row.id),
    name: String(row.title).replace(/\s+/g, " ").trim().slice(0, 120),
    category: "event",
    tags: [...new Set(tags)],
    lat: row.lat,
    lng: row.lng,
    address,
    priceLevel: row.is_free ? 1 : 2,
    photoUrl: `/fallback/${style.photo}.svg`,
    hours,
    typicalDurationMin,
    indoor: row.setting !== "À l'extérieur",
  });
  /** @type {EventPlaceT} */
  const out = { ...place, source: "event", hoursVerified: !multiDay };
  if (!multiDay) out.startsAt = start.toUTC().toISO() ?? undefined;
  if (row.url && /^https:\/\//.test(row.url)) out.eventUrl = row.url;
  // Spread after parse(): until Anthony's contract change is on main, Place.parse would strip these.
  return out;
}

/**
 * Feed events near a point: worth showing (eventRules), active in the range, within radius,
 * nearest first.
 * @param {EventRow[]} rows
 * @param {{ range: TimeRangeT, near: { lat: number, lng: number }, radiusKm?: number, limit?: number }} opts
 * @returns {EventPlaceT[]}
 */
export function pickEvents(rows, { range, near, radiusKm = 8, limit = 40 }) {
  return rows
    .filter(keepEvent)
    .map((r) => eventRowToPlace(r, range))
    .filter((p) => p !== null)
    .map((p) => ({ p, d: haversineKm(near.lat, near.lng, p.lat, p.lng) }))
    .filter(({ d }) => d <= radiusKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ p }) => p);
}

/** Local YYYY-MM-DD of an ISO instant (Montréal), for the start_date / end_date pre-filter. @param {string} iso */
export const localDay = (iso) => toLocal(iso).toISODate() ?? "";

/** Default range for looking up one event by id: yesterday → 8 days ahead. */
export function defaultEventRange(now = DateTime.now()) {
  return { start: now.minus({ days: 1 }).toUTC().toISO() ?? "", end: now.plus({ days: 8 }).toUTC().toISO() ?? "" };
}
