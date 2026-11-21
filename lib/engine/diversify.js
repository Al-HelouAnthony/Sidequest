/**
 * Part 8: one best visit per place, then a variety-aware re-rank. Pure. Owner: Anthony.
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
 * Greedy re-rank: at each step pick the highest score after subtracting
 * diversityPenalty × (times its category appeared in the last diversityWindow picks).
 * Input must already have at most one item per place (use bestPerPlace first).
 * @template {{ place: { id: string, category: string }, score: number }} T
 * @param {T[]} items
 * @param {typeof ENGINE} [cfg]
 * @returns {T[]}
 */
export function diversify(items, cfg = ENGINE) {
  const remaining = [...items];
  /** @type {T[]} */
  const picked = [];
  while (remaining.length) {
    const recent = picked.slice(-cfg.diversityWindow).map((p) => p.place.category);
    let bestIdx = 0;
    let bestAdj = -Infinity;
    remaining.forEach((item, idx) => {
      const adj = item.score - cfg.diversityPenalty * recent.filter((c) => c === item.place.category).length;
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = idx;
      }
    });
    picked.push(remaining.splice(bestIdx, 1)[0]);
  }
  return picked;
}
