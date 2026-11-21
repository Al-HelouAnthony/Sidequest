/**
 * Search words → feed filters. Plain code, no AI. Owner: Mhammad.
 * Used by POST /api/search. Word lists agreed with the team (2026-11-21).
 * Unknown words set no filter. Never throws.
 */
import { ENGINE } from "@/lib/engine/config";
import { atLocalTime, toIsoUtc } from "@/lib/time";

/**
 * Lowercase, no accents, words separated by single spaces, padded so we match whole words only.
 * @param {string} text
 */
export function normalize(text) {
  const plain = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return ` ${plain.replace(/[^a-z0-9]+/g, " ").trim()} `;
}
/** @param {string} text @param {string} phrase */
const has = (text, phrase) => text.includes(normalize(phrase));
/** @param {string} text @param {string[]} phrases */
const hasAny = (text, phrases) => phrases.some((p) => has(text, p));

const BUDGET = ["budget", "cheap", "affordable", "inexpensive", "low cost", "not expensive", "not pricey", "broke",
  "student", "for free", "free entry", "something free", "free stuff", "free things"];
const MID_RANGE = ["mid range", "moderate", "reasonable", "not too expensive"];

/** Category → words. Order = order of the chips in the summary. */
const CATEGORIES = {
  cafe: ["cafe", "coffee", "latte", "espresso", "tea", "brunch", "breakfast", "bakery", "pastry"],
  restaurant: ["restaurant", "food", "eat", "dinner", "lunch", "supper", "meal", "bite", "pizza", "sushi", "burger", "ramen", "poutine"],
  bar: ["bar", "drinks", "drink", "beer", "pub", "cocktails", "wine", "brewery", "happy hour"],
  park: ["park", "outside", "outdoors", "walk", "nature", "picnic", "mont royal", "mount royal"],
  viewpoint: ["view", "viewpoint", "lookout", "sunset", "scenic", "skyline"],
  activity: ["activity", "bowling", "climbing", "escape room", "arcade", "museum", "gallery", "games", "skating"],
  event: ["event", "show", "concert", "gig", "festival", "live music", "comedy", "market"],
};
/** @type {Record<string, string>} */
const CATEGORY_LABELS = { cafe: "Café", restaurant: "Food", bar: "Drinks", park: "Outdoors", viewpoint: "Views", activity: "Activities", event: "Events" };
const INDOOR = ["indoor", "indoors", "inside", "cozy", "out of the cold", "if it rains"];

/** @type {Record<string, number>} Luxon weekday: 1 = Monday … 7 = Sunday */
const WEEKDAYS = { monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 7, sun: 7 };
/** @type {Record<string, [string, string]>} */
const PARTS = { morning: ["09:00", "12:00"], afternoon: ["12:00", "18:00"], evening: ["18:00", ENGINE.dayEnd], night: ["18:00", ENGINE.dayEnd] };
/** @param {string} s */
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * Range in ISO UTC. Only a broken range (start ≥ end) gives no filter. A range that is already over
 * (e.g. "tonight" at 23:30) is kept: the feed is then empty and the app says "nothing fits, try a wider time".
 * @param {import("luxon").DateTime} start @param {import("luxon").DateTime} end @param {string} label
 */
function clamp(start, end, label) {
  if (start >= end) return null;
  return { range: { start: toIsoUtc(start), end: toIsoUtc(end) }, label };
}

/**
 * Which day (and part of day) the words ask for, as a range in Montréal time → ISO UTC.
 * @param {string} text normalized query
 * @param {import("luxon").DateTime} now Montréal time
 * @returns {{ range: { start: string, end: string }, label: string } | null}
 */
function dateRange(text, now) {
  let day = null;
  let dayLabel = "";
  let part = Object.keys(PARTS).find((p) => has(text, p)) ?? null;

  if (hasAny(text, ["tonight", "this evening"])) {
    day = now;
    part = "evening";
    dayLabel = "Tonight";
  } else if (hasAny(text, ["tomorrow", "tmrw", "tmr"])) {
    day = now.plus({ days: 1 });
    dayLabel = "Tomorrow";
  } else if (hasAny(text, ["this weekend", "weekend"])) {
    const sat = now.weekday === 7 ? now.minus({ days: 1 }) : now.plus({ days: (6 - now.weekday + 7) % 7 });
    return clamp(atLocalTime(sat, ENGINE.dayStart), atLocalTime(sat.plus({ days: 1 }), ENGINE.dayEnd), "This weekend");
  } else if (hasAny(text, ["today", "now", "later"])) {
    day = now;
    dayLabel = "Today";
  } else {
    const word = Object.keys(WEEKDAYS).find((w) => has(text, w));
    if (word) {
      day = now.plus({ days: (WEEKDAYS[word] - now.weekday + 7) % 7 });
      dayLabel = day.toFormat("ccc");
    } else if (part) {
      // "this afternoon", "something in the morning": a part of day alone means today.
      day = now;
      dayLabel = "This";
    }
  }
  if (!day) return null;

  const [from, to] = part ? PARTS[part] : [ENGINE.dayStart, ENGINE.dayEnd];
  // Keep the full range: the engine itself drops anything before now + 60 min, and a visit must fit
  // entirely inside the range, so shrinking it here would only hide good cards.
  const start = atLocalTime(day, from);
  const label = dayLabel === "Tonight" ? dayLabel : part ? `${dayLabel} ${part}` : dayLabel;
  return clamp(start, atLocalTime(day, to), label);
}

/**
 * @param {string} query what the user typed
 * @param {{ now: import("luxon").DateTime, friends: { id: string, name: string }[] }} context
 * @returns {{ filters: import("@/types/feed").FeedFiltersT, summary: string }}
 */
export function parseSearch(query, { now, friends }) {
  // "show me …" is not a show (event).
  const text = normalize(query).replace(" show me ", " ");
  /** @type {import("@/types/feed").FeedFiltersT} */
  const filters = {};
  const chips = [];

  if (hasAny(text, BUDGET)) {
    filters.priceMax = 1;
    chips.push("Budget");
  } else if (hasAny(text, MID_RANGE)) {
    filters.priceMax = 2;
    chips.push("Mid-range");
  }

  const withFriends = friends.filter((f) => has(text, f.name.split(" ")[0]));
  if (withFriends.length > 0) {
    filters.friendIds = withFriends.map((f) => f.id);
    chips.push(`with ${withFriends.map((f) => f.name.split(" ")[0]).join(" & ")}`);
  }

  const when = dateRange(text, now);
  if (when) {
    filters.dateRange = when.range;
    chips.push(cap(when.label));
  }

  const categories = Object.keys(CATEGORIES).filter((c) => hasAny(text, CATEGORIES[/** @type {keyof typeof CATEGORIES} */ (c)]));
  if (categories.length > 0) {
    filters.categories = /** @type {import("@/types/feed").FeedFiltersT["categories"]} */ (categories);
    chips.push(...categories.map((c) => CATEGORY_LABELS[c]));
  }

  if (hasAny(text, INDOOR)) {
    filters.indoorOnly = true;
    chips.push("Indoors");
  }

  return { filters, summary: chips.length > 0 ? chips.join(" · ") : "All suggestions" };
}
