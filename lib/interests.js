/**
 * The shared tag vocabulary. Owner: Adel.
 * PURE DATA, no imports: safe to import from client components (Oscar's interest chips).
 *
 * The SAME words are used for places.tags (data/places.json) and users.interests: the engine's
 * interest score compares the two, so any other word would score nothing. lib/data updateProfile
 * rejects interests not in this list, and tests/places.test.js rejects place tags not in it.
 * Adding a tag: add it here (and its label), then use it on places.
 */

/** @type {readonly string[]} */
export const INTEREST_TAGS = Object.freeze([
  "coffee",
  "cheap-eats",
  "views",
  "outdoors",
  "bars",
  "live-music",
  "art",
  "museums",
  "markets",
  "brunch",
  "iconic",
  "free",
  "late-night",
  "cocktails",
  "nature",
]);

/** Display labels for the chips (same keys as INTEREST_TAGS). @type {Readonly<Record<string, string>>} */
export const INTEREST_LABELS = Object.freeze({
  coffee: "Coffee",
  "cheap-eats": "Cheap eats",
  views: "Views",
  outdoors: "Outdoors",
  bars: "Bars",
  "live-music": "Live music",
  art: "Art",
  museums: "Museums",
  markets: "Markets",
  brunch: "Brunch",
  iconic: "Iconic spots",
  free: "Free",
  "late-night": "Late night",
  cocktails: "Cocktails",
  nature: "Nature",
});
