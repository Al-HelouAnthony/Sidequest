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
  /**
   * Minutes kept free before and after every busy block (class, shift): time to get there and back.
   * Class at 10:05 → suggestions end by 9:30 (30-min grid). Also used for invites (plans-store) and Start now.
   */
  bufferMin: 15,
  /** Nobody in the group travels longer than this. */
  maxTravelMin: 35,
  /**
   * Scoring only: bike trips (our stand-in for metro, stored when walking > 25 min) count this many times their minutes,
   * so walkable places win when everything else is equal. QA audit: walkable cards 6.5 → 10.75 of 20, avg 2.18 → 1.85 km.
   */
  bikeTripFactor: 2,
  /** Outdoor places are dropped above this rain probability (0–100). */
  rainCutoff: 60,
  /** Diversify: penalize a category seen in the previous N cards. */
  diversityWindow: 3,
  diversityPenalty: 0.15,
  /** N2: max seeded jitter (±) added to a place's score FOR ORDERING ONLY (card scores stay true). Was 0.05: the same
   * places kept the top 5 (QA audit on real data: 0.88 of 5 repeated next visit; now 0.19 with seenPenalty 0.15). */
  shuffleJitter: 0.07,
  /** N2: ordering penalty for places the user saw in earlier visits (client's `seen` list). Was 0.05. */
  seenPenalty: 0.15,
  /**
   * N1: ordering bonus for our curated places (verified hours, real info, our pick) over search-only
   * places (registry restaurants, OpenStreetMap venues). Bigger than any score gap, so curated come first.
   */
  curatedBonus: 1,
  /** Each place may offer its best slot on up to this many different days (the feed still shows it once). */
  windowsPerPlace: 2,
  /** Day variety: penalize a card on the same day as one of the previous N cards. */
  dayWindow: 2,
  dayPenalty: 0.06,
  pageSize: 10,
  /** Time grid resolution. Every slot starts and ends on a tick. */
  tickMin: 30,
  /** Don't suggest anything starting sooner than this from now. */
  minLeadMin: 60,
  /** A card needs at least this many friends free for the whole visit. */
  minFriends: 1,
  /** Novelty looks back this many days of interactions. */
  noveltyDays: 14,
  /** Max time /api/feed waits for Claude captions before sending template captions (ms). */
  // G6b: was 2500. The first page shouldn't wait on Claude: after 0.8 s it goes out with template
  // captions; the job keeps running (after()) and the next page is captioned in the background.
  captionBudgetMs: 800,
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
