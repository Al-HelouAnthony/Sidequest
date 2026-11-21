/**
 * Part 8: best visit(s) per place, then a variety-aware re-rank. Pure. Owner: Anthony.
 *
 * Each place may offer its best slot on up to `windowsPerPlace` DIFFERENT days; the re-rank then
 * picks at most one of them (a place never appears twice), preferring variety in category AND day.
 * Items may carry `day` (local day index); without it, only category variety applies.
 */
import { ENGINE } from "./config";

/**
 * @template {{ place: { id: string, category: string }, score: number }} T
 * Keep the highest-scoring item per place, sorted by score (desc).
 * @param {T[]} scored
 * @returns {T[]}
 */
export function bestPerPlace(scored) {
  /** @type {Map<string, T>} */
  const best = new Map();
  for (const s of scored) {
    const cur = best.get(s.place.id);
    if (!cur || s.score > cur.score) best.set(s.place.id, s);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * Per place: the best item on each day, then the top `perPlace` of those days. Sorted by score (desc).
 * @template {{ place: { id: string }, score: number, day: number }} T
 * @param {T[]} scored
 * @param {number} [perPlace]
 * @returns {T[]}
 */
export function bestWindowsPerPlace(scored, perPlace = ENGINE.windowsPerPlace) {
  /** @type {Map<string, T>} best per (place, day) */
  const bestPerDay = new Map();
  for (const s of scored) {
    const key = `${s.place.id}|${s.day}`;
    const cur = bestPerDay.get(key);
    if (!cur || s.score > cur.score) bestPerDay.set(key, s);
  }
  /** @type {Map<string, T[]>} */
  const byPlace = new Map();
  for (const s of bestPerDay.values()) byPlace.set(s.place.id, [...(byPlace.get(s.place.id) ?? []), s]);
  const out = [];
  for (const list of byPlace.values()) out.push(...list.sort((a, b) => b.score - a.score).slice(0, perPlace));
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Greedy re-rank: at each step pick the highest score after subtracting
 *   diversityPenalty × (same category in the last diversityWindow picks)
 * + dayPenalty      × (same day in the last dayWindow picks).
 * Once a place is picked, its other items are dropped (never the same place twice).
 * @template {{ place: { id: string, category: string }, score: number, day?: number }} T
 * @param {T[]} items
 * @param {typeof ENGINE} [cfg]
 * @returns {T[]}
 */
export function diversify(items, cfg = ENGINE) {
  let remaining = [...items];
  /** @type {T[]} */
  const picked = [];
  while (remaining.length) {
    const recentCats = picked.slice(-cfg.diversityWindow).map((p) => p.place.category);
    const recentDays = picked.slice(-(cfg.dayWindow ?? 0)).map((p) => p.day);
    let bestIdx = 0;
    let bestAdj = -Infinity;
    remaining.forEach((item, idx) => {
      const sameCat = recentCats.filter((c) => c === item.place.category).length;
      const sameDay = item.day === undefined ? 0 : recentDays.filter((d) => d === item.day).length;
      const adj = item.score - cfg.diversityPenalty * sameCat - (cfg.dayPenalty ?? 0) * sameDay;
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = idx;
      }
    });
    const chosen = remaining[bestIdx];
    picked.push(chosen);
    remaining = remaining.filter((it) => it.place.id !== chosen.place.id);
  }
  return picked;
}
