/**
 * Every tunable number in the feed engine lives here. Owner: Anthony.
 * Weights must sum to 1 (tests/contracts.test.js checks it).
 */

/** @type {Record<keyof import("@/types/feed").ScoreBreakdownT, number>} */
export const SCORE_WEIGHTS = {
  interest: 0.3,
  friends: 0.2,
  timing: 0.15,
  weather: 0.1,
  fairness: 0.1,
  novelty: 0.1,
  proximity: 0.05,
};

export const ENGINE = Object.freeze({
  horizonDays: 7,
  /** Waking hours, local Montréal time. */
  dayStart: "09:00",
  dayEnd: "23:00",
  minSlotMin: 60,
  /** Nobody in the group travels longer than this. */
  maxTravelMin: 35,
  /** Outdoor places are dropped above this rain probability (0–100). */
  rainCutoff: 60,
  /** Diversify: penalize a category seen in the previous N cards. */
  diversityWindow: 3,
  diversityPenalty: 0.15,
  pageSize: 10,
  /** Time grid resolution. Every slot starts and ends on a tick. */
  tickMin: 30,
  /** Don't suggest anything starting sooner than this from now. */
  minLeadMin: 60,
  /** A card needs at least this many friends free for the whole visit. */
  minFriends: 1,
  /** Novelty looks back this many days of interactions. */
  noveltyDays: 14,
});

export const LEARNING = Object.freeze({
  /** Added to each tag weight on save/go. */
  alpha: { save: 0.15, go: 0.3 },
  /** Subtracted from each tag weight on skip. Big enough that 3 skips visibly kill a category. */
  beta: 0.25,
  min: -1,
  max: 1,
  /** If weights["cat:<category>"] ≤ this, that category is suppressed (2 skips = -0.5). */
  suppressAt: -0.5,
  /** Suppressed categories get their score multiplied by this. */
  suppressFactor: 0.3,
});
