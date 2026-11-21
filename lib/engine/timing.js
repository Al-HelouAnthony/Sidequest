/**
 * Timing score: is this a good hour for this kind of place? Owner: Mhammad.
 * Used by Anthony's scoring (lib/engine/scoring.js) as the "timing" part of the score.
 * Pure maths: no fetching, never throws.
 */
import { toLocal } from "@/lib/time";

/**
 * Best hours per category, Montréal time, as decimal hours (11.5 = 11:30).
 * A number above 24 means after midnight (26 = 02:00 the next day).
 * @type {Record<string, [number, number][]>}
 */
const BEST_HOURS = {
  restaurant: [[11.5, 13.5], [18, 20.5]],
  cafe: [[8, 11.5], [14, 17]],
  bar: [[20, 26]],
  viewpoint: [[15.75, 16.75]], // sunset is about 16:15 in late November
  park: [[11, 15]],
  activity: [[13, 19]],
  event: [[13, 19]],
};

/** Returned for an unknown category or a bad date. */
const NEUTRAL = 0.5;
/** The lowest score a place can get. */
const FLOOR = 0.1;
/** How much the score drops for each hour away from the best hours. */
const DROP_PER_HOUR = 0.5;

/**
 * Hour of day (decimal, Montréal time) at the middle of the visit.
 * @param {string} startIso
 * @param {string} endIso
 * @returns {number} NaN if a date is invalid
 */
function middleHour(startIso, endIso) {
  const middle = (Date.parse(startIso) + Date.parse(endIso)) / 2;
  if (Number.isNaN(middle)) return NaN;
  const local = toLocal(new Date(middle).toISOString());
  return local.hour + local.minute / 60;
}

/**
 * Hours between `hour` and the nearest edge of the range (0 if inside).
 * Also tries `hour + 24` so ranges that run past midnight work.
 * @param {number} hour
 * @param {[number, number]} range
 */
function distanceToRange(hour, [from, to]) {
  const distances = [hour, hour + 24].map((h) => (h < from ? from - h : h > to ? h - to : 0));
  return Math.min(...distances);
}

/**
 * @param {import("@/types/domain").CategoryT} category
 * @param {string} slotStartIso  ISO UTC
 * @param {string} slotEndIso    ISO UTC
 * @returns {number} 0 to 1. 1 = best time for this category.
 */
export function timingScore(category, slotStartIso, slotEndIso) {
  if (!Object.hasOwn(BEST_HOURS, category)) return NEUTRAL;
  const hour = middleHour(slotStartIso, slotEndIso);
  if (Number.isNaN(hour)) return NEUTRAL;
  const distance = Math.min(...BEST_HOURS[category].map((range) => distanceToRange(hour, range)));
  return Math.max(FLOOR, 1 - DROP_PER_HOUR * distance);
}
