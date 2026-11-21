/**
 * Shared time helpers. Store UTC, compute and display in America/Toronto.
 * Owner: Anthony (engine), but anyone may add helpers. Don't change existing signatures.
 */
import { DateTime } from "luxon";
import { TIMEZONE } from "@/types/domain";

/**
 * ISO UTC string → Luxon DateTime in Montréal time.
 * @param {string} iso
 * @returns {DateTime}
 */
export function toLocal(iso) {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(TIMEZONE);
}

/**
 * Luxon DateTime (any zone) → ISO UTC string.
 * @param {DateTime} dt
 * @returns {string}
 */
export function toIsoUtc(dt) {
  const iso = dt.toUTC().toISO();
  if (!iso) throw new Error("Invalid DateTime");
  return iso;
}

/** @returns {DateTime} */
export function nowLocal() {
  return DateTime.now().setZone(TIMEZONE);
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Luxon weekday (1 = Mon … 7 = Sun) → "mon" … "sun".
 * @param {DateTime} dt
 * @returns {import("@/types/domain").WeekdayT}
 */
export function weekdayKey(dt) {
  return /** @type {import("@/types/domain").WeekdayT} */ (WEEKDAYS[dt.setZone(TIMEZONE).weekday - 1]);
}

/**
 * "HH:mm" on the local day of `day` → DateTime in Montréal time.
 * @param {DateTime} day
 * @param {string} hhmm
 */
export function atLocalTime(day, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return day.setZone(TIMEZONE).set({ hour, minute, second: 0, millisecond: 0 });
}

/**
 * "Sat 2:00–4:00 PM" or "Sat 11:00 AM–1:00 PM".
 * @param {string} startIso
 * @param {string} endIso
 */
export function formatSlot(startIso, endIso) {
  const s = toLocal(startIso);
  const e = toLocal(endIso);
  const sameMeridiem = s.toFormat("a") === e.toFormat("a");
  const startStr = sameMeridiem ? s.toFormat("ccc h:mm") : s.toFormat("ccc h:mm a");
  return `${startStr}–${e.toFormat("h:mm a")}`;
}

/**
 * @param {string} startIso
 * @param {string} endIso
 */
export function minutesBetween(startIso, endIso) {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
}
