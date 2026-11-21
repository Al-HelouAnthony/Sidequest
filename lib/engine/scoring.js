/**
 * Part 7: scoring. Every component is 0–1, then weighted by SCORE_WEIGHTS. Pure. Owner: Anthony.
 * Skeleton versions of 7a–7c (simple formulas); edge-case tests come in the harden pass.
 * Timing is ENGINE.defaultTiming (0.5) until Mhammad's lib/engine/timing.js is merged.
 */
import { ENGINE, LEARNING, SCORE_WEIGHTS } from "./config";
import { travelKey } from "./context";

/** @typedef {import("./candidates").Candidate} Candidate */
/** @typedef {import("./context").EngineContext} EngineContext */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Part 7a. @param {import("@/types/domain").PlaceT} place @param {EngineContext} ctx */
export function interestScore(place, ctx) {
  const w = ctx.tagWeights;
  const tagPart = place.tags.length
    ? place.tags.reduce((s, tag) => s + (w[tag] ?? 0) + (ctx.me.interests.includes(tag) ? 0.5 : 0), 0) / place.tags.length
    : 0;
  return sigmoid(3 * (tagPart + (w[`cat:${place.category}`] ?? 0)));
}

/** Part 7b: Σ closeness of free friends, 6 = "full" (e.g. two closeness-3 friends). @param {Candidate} c @param {EngineContext} ctx */
export function friendsScore(c, ctx) {
  const sum = c.friendIds.reduce((s, id) => s + (ctx.friends.find((f) => f.user.id === id)?.closeness ?? 0), 0);
  return clamp01(sum / 6);
}

/** Part 7b: minimax, so the person travelling the longest decides. @param {Candidate} c @param {EngineContext} ctx */
export function fairnessScore(c, ctx) {
  const times = [c.myMin, ...c.friendIds.map((id) => ctx.travel.get(travelKey(id, c.place.id))?.minutes ?? ENGINE.maxTravelMin)];
  return clamp01(1 - Math.max(...times) / ENGINE.maxTravelMin);
}

/** Part 7b. @param {Candidate} c */
export const proximityScore = (c) => clamp01(1 - c.myMin / ENGINE.maxTravelMin);

/** Part 7c. @param {Candidate} c */
export function weatherScore(c) {
  const { rainProb, tempC } = c.weather;
  if (c.place.indoor) return rainProb > ENGINE.rainCutoff ? 1 : 0.8;
  return clamp01((1 - rainProb / 100) * clamp01((tempC + 5) / 25));
}

const NOVELTY_BY_ACTION = { save: 0.6, skip: 0.2, go: 0.1 };

/** Part 7c: the latest interaction with this place wins. @param {Candidate} c @param {EngineContext} ctx */
export function noveltyScore(c, ctx) {
  let latest = null;
  for (const it of ctx.recentInteractions) {
    if (it.placeId === c.place.id && (!latest || it.createdAt > latest.createdAt)) latest = it;
  }
  return latest ? NOVELTY_BY_ACTION[latest.action] : 1;
}

/** True if the user has learned to dislike this category (Part 10 makes this happen after 2 skips). @param {string} category @param {EngineContext} ctx */
export const isSuppressed = (category, ctx) => (ctx.tagWeights[`cat:${category}`] ?? 0) <= LEARNING.suppressAt;

/**
 * Part 7d: weighted total + breakdown for "Why am I seeing this?".
 * @param {Candidate} c @param {EngineContext} ctx
 * @returns {{ score: number, breakdown: import("@/types/feed").ScoreBreakdownT }}
 */
export function scoreCandidate(c, ctx) {
  const breakdown = {
    interest: interestScore(c.place, ctx),
    friends: friendsScore(c, ctx),
    timing: ENGINE.defaultTiming,
    weather: weatherScore(c),
    fairness: fairnessScore(c, ctx),
    novelty: noveltyScore(c, ctx),
    proximity: proximityScore(c),
  };
  let score = 0;
  for (const [k, v] of Object.entries(breakdown)) score += SCORE_WEIGHTS[/** @type {keyof typeof SCORE_WEIGHTS} */ (k)] * v;
  if (isSuppressed(c.place.category, ctx)) score *= LEARNING.suppressFactor;
  return { score, breakdown };
}
