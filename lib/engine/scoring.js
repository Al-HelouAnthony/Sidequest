/**
 * Part 7: scoring. Every component is 0–1, then weighted by SCORE_WEIGHTS. Pure. Owner: Anthony.
 * Skeleton versions of 7a–7c (simple formulas); edge-case tests come in the harden pass.
 * Timing comes from Mhammad's lib/engine/timing.js (his file; never edit it here).
 */
import { ENGINE, LEARNING, SCORE_WEIGHTS } from "./config";
import { travelKey } from "./context";
import { timingScore } from "./timing";

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

/**
 * Part 7b: share of the user's friendship "weight" that is free: Σ closeness of free friends
 * ÷ Σ closeness of ALL friends. Whole group free → 1; two closest of four → ~0.67.
 * (Was ÷ 6, which saturated at 1.0 for almost every card on real data.)
 * @param {Candidate} c @param {EngineContext} ctx
 */
export function friendsScore(c, ctx) {
  const closeness = (id) => ctx.friends.find((f) => f.user.id === id)?.closeness ?? 0;
  const total = ctx.friends.reduce((s, f) => s + f.closeness, 0);
  if (total === 0) return 0;
  return clamp01(c.friendIds.reduce((s, id) => s + closeness(id), 0) / total);
}

/**
 * Minutes as they FEEL, for scoring only (the card still shows the real estimate and the cap uses it).
 * Over 25 min on foot we store bike time as a stand-in for metro/BIXI: "15 min" can mean 3 km, so those
 * trips count ×ENGINE.bikeTripFactor. Walkable places then win when everything else is equal.
 * @param {EngineContext} ctx @param {string} userId @param {string} placeId @param {number} [fallback]
 */
export function feltMinutes(ctx, userId, placeId, fallback = ENGINE.maxTravelMin) {
  const t = ctx.travel.get(travelKey(userId, placeId));
  if (!t) return fallback;
  return t.mode === "cycling-regular" ? t.minutes * ENGINE.bikeTripFactor : t.minutes;
}

/** Part 7b: minimax, so the person travelling the longest decides. @param {Candidate} c @param {EngineContext} ctx */
export function fairnessScore(c, ctx) {
  const times = [feltMinutes(ctx, ctx.me.id, c.place.id, c.myMin), ...c.friendIds.map((id) => feltMinutes(ctx, id, c.place.id))];
  return clamp01(1 - Math.max(...times) / ENGINE.maxTravelMin);
}

/** Part 7b. @param {Candidate} c @param {EngineContext} [ctx] without ctx: the plain minutes */
export const proximityScore = (c, ctx) => clamp01(1 - (ctx ? feltMinutes(ctx, ctx.me.id, c.place.id, c.myMin) : c.myMin) / ENGINE.maxTravelMin);

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
    // An event happens when it happens: its time is part of what it is, so it never loses on timing
    // (timingScore's "event" curve peaks 13–19 and would bury a 7:30 PM concert).
    timing: c.place.source === "event" ? 1 : timingScore(c.place.category, new Date(c.startMs).toISOString(), new Date(c.endMs).toISOString()),
    weather: weatherScore(c),
    fairness: fairnessScore(c, ctx),
    novelty: noveltyScore(c, ctx),
    proximity: proximityScore(c, ctx),
  };
  let score = 0;
  for (const [k, v] of Object.entries(breakdown)) score += SCORE_WEIGHTS[/** @type {keyof typeof SCORE_WEIGHTS} */ (k)] * v;
  if (isSuppressed(c.place.category, ctx)) score *= LEARNING.suppressFactor;
  return { score, breakdown };
}
