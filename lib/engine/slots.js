/**
 * Parts 2–3: time grid + free-time masks. Pure. Owner: Anthony.
 *
 * Instead of interval math, time is a grid of `tickMin`-minute ticks over the horizon,
 * only inside waking hours (Montréal time). Every gate (free, open, rain) is a per-tick check.
 */
import { atLocalTime, toIsoUtc, weekdayKey } from "@/lib/time";
import { ENGINE } from "./config";

/**
 * @typedef {object} Tick
 * @property {number} i            index in the ticks array
 * @property {number} startMs      epoch ms
 * @property {number} endMs        epoch ms (exclusive)
 * @property {string} startIso     ISO UTC
 * @property {import("@/types/domain").WeekdayT} weekday   local weekday
 * @property {number} minuteOfDay  local minutes since midnight (e.g. 14:30 → 870)
 * @property {number} dayIndex     0 = today
 */

/**
 * Part 2: ticks from (now + lead time, rounded up to a tick) to the end of the horizon.
 * @param {import("luxon").DateTime} now
 * @param {typeof ENGINE} [cfg]
 * @returns {Tick[]}
 */
export function buildTicks(now, cfg = ENGINE) {
  const tickMs = cfg.tickMin * 60_000;
  const earliest = Math.ceil((now.toMillis() + cfg.minLeadMin * 60_000) / tickMs) * tickMs;
  const today = now.startOf("day");
  /** @type {Tick[]} */
  const ticks = [];
  for (let d = 0; d < cfg.horizonDays; d++) {
    const day = today.plus({ days: d });
    const weekday = weekdayKey(day);
    const endMs = atLocalTime(day, cfg.dayEnd).toMillis();
    for (let t = atLocalTime(day, cfg.dayStart); t.toMillis() + tickMs <= endMs; t = t.plus({ minutes: cfg.tickMin })) {
      const startMs = t.toMillis();
      if (startMs < earliest) continue;
      ticks.push({
        i: ticks.length,
        startMs,
        endMs: startMs + tickMs,
        startIso: toIsoUtc(t),
        weekday,
        minuteOfDay: t.hour * 60 + t.minute,
        dayIndex: d,
      });
    }
  }
  return ticks;
}

/**
 * Part 3: 1 = free for the whole tick, 0 = some busy block overlaps it (conservative).
 * `bufferMin` widens every block on both sides: time to get there and back. A class at 10:05 with a 15-min
 * buffer blocks from 9:50, so nothing is suggested to end at 10:00.
 * @param {import("@/types/domain").BusyBlockT[]} blocks
 * @param {Tick[]} ticks
 * @param {number} [bufferMin] default 0 (exact blocks); the feed passes ENGINE.bufferMin
 * @returns {Uint8Array}
 */
export function freeMask(blocks, ticks, bufferMin = 0) {
  const mask = new Uint8Array(ticks.length).fill(1);
  const pad = bufferMin * 60_000;
  for (const b of blocks) {
    const bs = Date.parse(b.startAt) - pad;
    const be = Date.parse(b.endAt) + pad;
    for (const t of ticks) {
      if (t.startMs >= be) break; // ticks are sorted
      if (t.endMs > bs) mask[t.i] = 0;
    }
  }
  return mask;
}

/**
 * True if mask[i … i+n-1] are all 1.
 * @param {ArrayLike<number>} mask @param {number} i @param {number} n
 */
export function allTrue(mask, i, n) {
  for (let k = i; k < i + n; k++) if (!mask[k]) return false;
  return true;
}

/**
 * True if ticks[i … i+n-1] exist and are back-to-back (no gap overnight or from a dateRange cut).
 * @param {Tick[]} ticks @param {number} i @param {number} n @param {typeof ENGINE} [cfg]
 */
export function isContiguous(ticks, i, n, cfg = ENGINE) {
  const last = ticks[i + n - 1];
  return !!last && last.startMs - ticks[i].startMs === (n - 1) * cfg.tickMin * 60_000;
}
