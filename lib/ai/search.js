/**
 * Search words → feed filters. Plain code, no AI. Owner: Mhammad.
 * Used by POST /api/search. Word lists agreed with the team (2026-11-21).
 * Unknown words set no filter. Never throws.
 * Specific things ("bowling", "museum", "pizza"…) come from lib/ai/searchTerms.js: they are returned as
 * `what` and /api/search keeps only places whose name/tags match them (category fallback if none).
 */
import { ENGINE } from "@/lib/engine/config";
import { atLocalTime, toIsoUtc } from "@/lib/time";
import { normalize } from "./normalize";
import { SEARCH_TERMS, findTerms } from "./searchTerms";

export { normalize };
/** @param {string} text @param {string} phrase */
const has = (text, phrase) => text.includes(normalize(phrase));
/** @param {string} text @param {string[]} phrases */
const hasAny = (text, phrases) => phrases.some((p) => has(text, p));

const BUDGET = ["budget", "cheap", "affordable", "inexpensive", "low cost", "not expensive", "not pricey", "broke",
  "student", "for free", "free entry", "something free", "free stuff", "free things", "gratuit", "gratuite",
  "free event", "free events", "free expo", "free show", "free concert", "free festival"];
const MID_RANGE = ["mid range", "moderate", "reasonable", "not too expensive"];

/** Category → words. Order = order of the chips in the summary. */
const CATEGORIES = {
  cafe: ["cafe", "coffee", "latte", "espresso", "tea", "brunch", "breakfast", "bakery", "pastry"],
  restaurant: ["restaurant", "food", "eat", "dinner", "lunch", "supper", "meal", "bite", "pizza", "sushi", "burger", "ramen", "poutine"],
  bar: ["bar", "drinks", "drink", "beer", "pub", "cocktails", "wine", "brewery", "happy hour"],
  park: ["park", "outside", "outdoors", "walk", "nature", "picnic", "mont royal", "mount royal"],
  viewpoint: ["view", "viewpoint", "lookout", "sunset", "scenic", "skyline"],
  activity: ["activity", "bowling", "climbing", "escape room", "arcade", "museum", "gallery", "games", "skating"],
  // No "market" here: every market in the data (Jean-Talon, Atwater, Bonsecours) is an activity.
  // Events = Adel's dated city events (category "event", via loadContext). Film/cinema and theatre are
  // specific terms instead (searchTerms.js): they keep curated Cinéma Moderne + the venues, and events tagged so.
  event: ["event", "events", "show", "shows", "concert", "concerts", "gig", "festival", "festivals", "live music", "comedy",
    "spectacle", "spectacles", "expo", "expos", "exhibit", "exhibition", "exhibitions", "exposition", "expositions",
    "danse", "dance show", "free event", "free events"],
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

/** Little words that never mean a place (English + French). Everything else unknown becomes a name search. */
const STOPWORDS = new Set(
  ("a an the to for with and or of in at on near nearby around me us my our we i you it is are be "
    + "some any something anything somewhere someplace place places spot spots good nice best great cool fun new "
    + "go going get grab find want looking look need like lets let s can could would do does please "
    + "what where who when how there here that then after before together friend friends everyone all time "
    + "out hang hangout chill vibe vibes open close closest free available this next "
    + "un une des le la les l du de d avec pour et ou au aux ce cet cette quelque chose endroit soir demain aujourd hui")
    .split(" "),
);
/** Every phrase search understands (normalized). A word counts as understood only if its WHOLE phrase matched. */
const ALL_PHRASES = [
  ...BUDGET, ...MID_RANGE, ...Object.values(CATEGORIES).flat(), ...INDOOR, ...Object.keys(WEEKDAYS), ...Object.keys(PARTS),
  "tonight", "this evening", "tomorrow", "tmrw", "tmr", "this weekend", "weekend", "today", "now", "later", "show",
  ...SEARCH_TERMS.flatMap((t) => t.words),
].map((p) => normalize(p));

/**
 * Words of this query that belong to a phrase that matched ("parc aquatique" only counts if both words are there).
 * @param {string} text normalized query
 */
function understoodWords(text) {
  return new Set(ALL_PHRASES.filter((p) => text.includes(p)).flatMap((p) => p.trim().split(" ")));
}

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
 * @returns {{
 *   filters: import("@/types/feed").FeedFiltersT,
 *   summary: string,
 *   what: import("./searchTerms").SearchTerm[],
 *   fallbackSummary: string | null,
 * }}
 * `what`: specific things asked for (route keeps matching places). `fallbackSummary`: the chips to show
 * when none match and the route falls back to their categories ("No bowling nearby · showing Activities").
 * `nameQuery`: unknown words when nothing specific matched (a name search). `refine`: unknown words next to
 * a specific thing ("cinema du parc" → "parc"), used to narrow its results to that name when possible.
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

  // Specific things ("bowling", "pizza"…). Their name replaces the broad category chip ("Pizza", not "Food").
  const what = findTerms(text);
  const whatCategories = new Set(what.map((t) => t.category));
  // N1: one cuisine per search (FeedFilters.cuisine, Anthony's contract). /api/search adds registry places for it.
  const cuisineTerm = what.find((t) => t.cuisine);
  if (cuisineTerm) /** @type {any} */ (filters).cuisine = cuisineTerm.cuisine;
  chips.push(...what.map((t) => t.label));

  const categories = Object.keys(CATEGORIES).filter((c) => hasAny(text, CATEGORIES[/** @type {keyof typeof CATEGORIES} */ (c)]));
  if (categories.length > 0) {
    filters.categories = /** @type {import("@/types/feed").FeedFiltersT["categories"]} */ (categories);
    chips.push(...categories.filter((c) => !whatCategories.has(c)).map((c) => CATEGORY_LABELS[c]));
  }

  /** @type {string[]} */
  const endChips = [];
  if (hasAny(text, INDOOR)) {
    filters.indoorOnly = true;
    endChips.push("Indoors");
  }

  // Words search didn't understand ("hotel", "o four", "schwartz") → a name search, unless a specific thing matched.
  const friendWords = new Set(friends.flatMap((f) => normalize(f.name.split(" ")[0]).trim().split(" ")));
  const understood = understoodWords(text);
  const leftover = text.trim().split(" ").filter((w) => w && !understood.has(w) && !STOPWORDS.has(w) && !friendWords.has(w));
  const leftoverText = leftover.length > 0 ? leftover.join(" ") : null;
  // No specific thing: the leftover words ARE the search (a name). With one ("cinema du parc"): they narrow it.
  const nameQuery = what.length === 0 ? leftoverText : null;
  const refine = what.length > 0 ? leftoverText : null;
  const nameChip = nameQuery ? `“${nameQuery}”` : null;

  const summary = [...chips, ...(nameChip ? [nameChip] : []), ...endChips].join(" · ") || "All suggestions";
  // If nothing matches the specific things, the route shows their categories instead and says so.
  const baseChips = chips.filter((c) => !what.some((t) => t.label === c) && !Object.values(CATEGORY_LABELS).includes(c));
  const fallbackSummary = what.length
    ? [
        `No ${what.map((t) => t.label.toLowerCase()).join(" or ")} nearby`,
        `showing ${[...whatCategories].map((c) => CATEGORY_LABELS[c]).join(" & ")}`,
        ...baseChips,
        ...endChips,
      ].join(" · ")
    : null;
  // If no place is called that, the route shows the other filters' results and says so honestly.
  const nameFallbackSummary = nameQuery
    ? [`Nothing called ${nameChip} nearby`, chips.length || endChips.length ? null : "showing all suggestions", ...chips, ...endChips]
        .filter(Boolean)
        .join(" · ")
    : null;

  return { filters, summary, what, fallbackSummary, nameQuery, nameFallbackSummary, refine };
}

/**
 * Name search: does this place's name contain every word of `nameQuery` (whole words, accents ignored)?
 * "o four" → "O FOUR", "schwartz" → "Schwartz's Deli", "hotel" → "Bar de l'Hôtel …".
 * @param {string} name
 * @param {string} nameQuery
 */
export function nameMatches(name, nameQuery) {
  const hay = normalize(name);
  return nameQuery.split(" ").every((w) => hay.includes(` ${w} `));
}
