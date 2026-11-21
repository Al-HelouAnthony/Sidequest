/**
 * N2 + N3: per-visit variety and endless paging. Pure. Owner: Anthony.
 *
 * - noise(seed, key): deterministic number in [-1, 1] (same seed + key → same value), so one visit's
 *   pages agree with each other while different visits shuffle differently.
 * - parseCursor / nextCursor: "pass:offset" cursors for the endless feed (pass 1 = best slot per place,
 *   pass 2 = each place's other good slot, pass ≥ 3 = loop, reshuffled). Plain numbers = legacy pass 1.
 */

/** FNV-1a 32-bit hash of a string. @param {string} s */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic noise in [-1, 1] for (seed, key). mulberry32 step on a hash of both.
 * @param {number} seed @param {string} key
 */
export function noise(seed, key) {
  let t = (fnv1a(`${seed}:${key}`) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  return unit * 2 - 1;
}

/** Seed used for a pass: passes 1–2 use the visit seed; loop passes get their own so each loop reshuffles. */
export const seedForPass = (/** @type {number | undefined} */ seed, /** @type {number} */ pass) =>
  pass >= 3 ? fnv1a(`${seed ?? 0}:loop:${pass}`) : seed;

/**
 * @param {string | null | undefined} cursor
 * @returns {{ pass: number, offset: number }}
 */
export function parseCursor(cursor) {
  if (!cursor) return { pass: 1, offset: 0 };
  const m = /^(\d{1,4}):(\d{1,6})$/.exec(cursor);
  if (m) return { pass: Math.max(1, Number(m[1])), offset: Number(m[2]) };
  const legacy = Number(cursor);
  return { pass: 1, offset: Number.isFinite(legacy) && legacy > 0 ? Math.floor(legacy) : 0 };
}

/**
 * Where the next page starts, or null when the feed is truly over.
 * Unfiltered feeds never end while there is at least one place (pass ≥ 3 loops forever);
 * searches stop after pass 2 so the same few results don't repeat.
 * @param {{ pass: number, offset: number, pageSize: number, length: number, pass2Length: number, filtered: boolean }} p
 * @returns {string | null}
 */
export function nextCursor({ pass, offset, pageSize, length, pass2Length, filtered }) {
  const next = offset + pageSize;
  if (next < length) return `${pass}:${next}`;
  if (pass === 1) {
    if (pass2Length > 0) return "2:0";
    return filtered || length === 0 ? null : "3:0";
  }
  if (filtered) return null;
  return length === 0 ? null : `${pass + 1}:0`;
}
