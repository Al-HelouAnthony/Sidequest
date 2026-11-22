/**
 * City events (Montréal open data) in the UI. Owner: Oscar.
 * Contract (Anthony, types/*): place.source === "event", optional place.startsAt (exact start, ISO; the slot
 * itself snaps to 30 min) and place.eventUrl. Until that contract is on main the fields are simply absent.
 */
import { toLocal } from "@/lib/time";

/** Source line shown on event cards (licence credit lives in the You tab). */
export const EVENT_SOURCE = "Ville de Montréal (open data)";

/**
 * @param {{ source?: string, category?: string }} place
 * @returns {boolean}
 */
export const isEvent = (place) => place.source === "event" || place.category === "event";

/**
 * "Starts 7:30 PM", or "Sat · Starts 7:30 PM" with the day.
 * @param {string} iso
 * @param {{ withDay?: boolean }} [opts]
 */
export function startsLabel(iso, { withDay = false } = {}) {
  const t = toLocal(iso);
  return `${withDay ? `${t.toFormat("ccc")} · ` : ""}Starts ${t.toFormat("h:mm a")}`;
}
