/**
 * Part 10: learning from swipes. Pure. Owner: Anthony.
 *
 * Two kinds of keys in the same TagWeights record (Adel's user_tag_weights table stores both):
 *  - "cat:<category>" gets the FULL step. Two skips → -0.5 = LEARNING.suppressAt → the category
 *    is suppressed in scoring.js (×0.3). This is the visible demo moment.
 *  - each place tag gets the step SPLIT across the place's tags. Skipping a bar tagged
 *    ["bars", "coffee", "brunch"] mostly teaches "not bars", and barely touches coffee.
 * Every weight is clamped to [LEARNING.min, LEARNING.max] = [-1, 1].
 */
import { LEARNING } from "./config";

/** @typedef {import("@/types/domain").TagWeightsT} TagWeightsT */

const clamp = (x) => Math.min(LEARNING.max, Math.max(LEARNING.min, x));
const round4 = (x) => Math.round(x * 10_000) / 10_000;

/**
 * How much one action moves the weights (negative = dislike).
 * @param {"skip" | "save" | "go"} action
 */
export function stepFor(action) {
  if (action === "skip") return -LEARNING.beta;
  return LEARNING.alpha[action];
}

/**
 * Returns NEW weights after one interaction (the input is never mutated).
 * @param {TagWeightsT} weights
 * @param {Pick<import("@/types/domain").PlaceT, "category" | "tags">} place
 * @param {"skip" | "save" | "go"} action
 * @returns {TagWeightsT}
 */
export function applyInteraction(weights, place, action) {
  const step = stepFor(action);
  const next = { ...weights };
  const bump = (key, delta) => {
    next[key] = round4(clamp((next[key] ?? 0) + delta));
  };

  bump(`cat:${place.category}`, step);
  const tags = [...new Set(place.tags)];
  for (const tag of tags) bump(tag, step / tags.length);
  return next;
}
