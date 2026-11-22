/**
 * Part 9: buildFeed(). The whole engine pipeline. Pure (data comes in via ctx). Owner: Anthony.
 *
 *   ticks → candidates (hard constraints) → score → best slots per place (≤ 2 days)
 *         → diversify (category + day variety, one card per place) → FeedCard[]
 *
 * N2 (variety): with a `seed`, each place's ORDERING score gets a small seeded jitter, and places in
 *   `seen` drop a little. Card `score`/`breakdown` always stay the true values.
 * N3 (endless): `pass` 1 = best slot per place, 2 = each place's other good slot, ≥ 3 = loop
 *   (pass-specific reshuffle; ids get ":p<pass>" so the client's dedupe keeps them).
 *
 * Called by /api/feed and Mhammad's /api/search with { filters }.
 */
import { templateCaption } from "@/lib/ai/templates";
import { buildTicks } from "./slots";
import { generateCandidates } from "./candidates";
import { scoreCandidate } from "./scoring";
import { bestWindowsPerPlace, diversify } from "./diversify";
import { travelKey } from "./context";
import { ENGINE } from "./config";
import { noise, seedForPass } from "./variety";

/** @typedef {import("./context").EngineContext} EngineContext */
/** @typedef {import("@/types/feed").FeedCardT} FeedCardT */

const round3 = (x) => Math.round(x * 1000) / 1000;

/** @param {{ startMs: number, endMs: number }} c */
const slotOf = (c) => ({ start: new Date(c.startMs).toISOString(), end: new Date(c.endMs).toISOString() });

/**
 * The free friends of a candidate, as cards show them (name, avatar, travel to that place).
 * @param {{ friendIds: string[], place: { id: string } }} c
 * @param {EngineContext} ctx
 * @returns {import("@/types/feed").FeedFriendT[]}
 */
function friendsOf(c, ctx) {
  return c.friendIds.map((id) => {
    const f = /** @type {{ user: import("@/types/domain").UserT }} */ (ctx.friends.find((x) => x.user.id === id));
    const t = ctx.travel.get(travelKey(id, c.place.id));
    return {
      id,
      name: f.user.name,
      avatarUrl: f.user.avatarUrl,
      travelMin: t?.minutes ?? 0,
      travelIsEstimate: t?.isEstimate ?? true,
    };
  });
}

/**
 * G3: what counts as "the same thing at another time": the same place, or for city events the same
 * show (same name at the same venue) on another date, which is another event row.
 * @param {import("@/types/domain").PlaceT} p
 */
export const seriesKey = (p) =>
  p.source === "event" ? `event|${p.name.trim().toLowerCase()}|${p.lat.toFixed(4)},${p.lng.toFixed(4)}` : p.id;

const TWO_HOURS_MS = 2 * 3_600_000;

/**
 * G3: up to `max` other good times for this card, from the already-scored candidates (so every one
 * passed the hard rules: open, travel cap, its friends free for the whole visit). Each is on another
 * day or ≥ 2 h from the card's slot and from each other; best true score first.
 * @param {{ place: import("@/types/domain").PlaceT, startMs: number, day: number }} card
 * @param {Map<string, Array<import("./candidates").Candidate & { baseScore: number, day: number }>>} bySeries
 * @param {EngineContext} ctx
 * @param {number} [max]
 * @returns {import("@/types/feed").FeedCardT["alternatives"]}
 */
function alternativesFor(card, bySeries, ctx, max = 3) {
  const picked = [];
  for (const s of bySeries.get(seriesKey(card.place)) ?? []) {
    const clash = [card, ...picked].some((o) => o.day === s.day && Math.abs(o.startMs - s.startMs) < TWO_HOURS_MS);
    if (clash) continue;
    picked.push(s);
    if (picked.length === max) break;
  }
  return picked.map((s) => ({ placeId: s.place.id, slot: slotOf(s), friends: friendsOf(s, ctx) }));
}

/**
 * @param {import("./candidates").Candidate & { score: number, baseScore?: number, breakdown: import("@/types/feed").ScoreBreakdownT }} c
 * @param {EngineContext} ctx
 * @param {string} [idSuffix]
 * @returns {FeedCardT}
 */
function toCard(c, ctx, idSuffix = "") {
  const slot = slotOf(c);
  const friends = friendsOf(c, ctx);
  const p = c.place;
  /** @type {import("@/types/feed").ScoreBreakdownT} */
  const breakdown = Object.fromEntries(Object.entries(c.breakdown).map(([k, v]) => [k, round3(v)]));
  return {
    id: `${p.id}:${slot.start}${idSuffix}`,
    place: {
      id: p.id, name: p.name, category: p.category, photoUrl: p.photoUrl, priceLevel: p.priceLevel, lat: p.lat, lng: p.lng, address: p.address, tags: p.tags,
      // N1: only sent when set, so curated cards look exactly as before.
      ...(p.source ? { source: p.source } : {}),
      ...(p.hoursVerified === false ? { hoursVerified: false } : {}),
      // Events: exact start (the slot snaps to 30 min) + the event page.
      ...(p.startsAt ? { startsAt: p.startsAt } : {}),
      ...(p.eventUrl ? { eventUrl: p.eventUrl } : {}),
    },
    slot,
    myTravelMin: c.myMin,
    friends,
    weather: c.weather,
    score: round3(c.baseScore ?? c.score),
    breakdown,
    caption: templateCaption({ friends, weather: c.weather, myTravelMin: c.myMin }),
  };
}

/**
 * @param {EngineContext} ctx
 * @param {{ filters?: import("@/types/feed").FeedFiltersT, debug?: boolean,
 *           seed?: number, seen?: string[], pass?: number }} [opts]
 * @returns {{ cards: FeedCardT[], debug?: { ticks: number, windows: number, candidates: number, places: number, dropped: Record<string, number>, tagWeights: import("@/types/domain").TagWeightsT, pass: number, ms: number } }}
 */
export function buildFeed(ctx, opts = {}) {
  const t0 = performance.now(); // duration only; the engine never reads the time of day
  const filters = opts.filters ?? {};
  const pass = Math.max(1, opts.pass ?? 1);
  const seed = seedForPass(opts.seed, pass);
  const seen = new Set(opts.seen ?? []);

  let ticks = buildTicks(ctx.now);
  if (filters.dateRange) {
    const from = Date.parse(filters.dateRange.start);
    const to = Date.parse(filters.dateRange.end);
    ticks = ticks.filter((t) => t.startMs >= from && t.endMs <= to).map((t, i) => ({ ...t, i }));
  }

  const { candidates, dropped, windows } = generateCandidates(ctx, ticks, filters);
  // Ordering score = true score + seeded jitter (per place, so a place's slots move together) − seen penalty.
  const scored = candidates.map((c) => {
    const { score, breakdown } = scoreCandidate(c, ctx);
    const jitter = seed === undefined ? 0 : ENGINE.shuffleJitter * noise(seed, c.place.id);
    const seenDrop = seen.has(c.place.id) ? ENGINE.seenPenalty : 0;
    // N1: our picks (verified hours) before search-only places (registry restaurants, OSM venues).
    const curated = c.place.hoursVerified === false ? 0 : ENGINE.curatedBonus;
    return { ...c, breakdown, baseScore: score, score: score + jitter - seenDrop + curated, day: ticks[c.startTick].dayIndex };
  });
  const perPlace = bestWindowsPerPlace(scored);
  const primary = diversify(perPlace);

  let ranked = primary;
  if (pass === 2) {
    // Each place's OTHER good slot (another day), for places that have one.
    const shown = new Map(primary.map((c) => [c.place.id, c.day]));
    ranked = diversify(perPlace.filter((w) => shown.has(w.place.id) && w.day !== shown.get(w.place.id)));
  }
  // G3: one card per show: other dates of the same event become that card's alternatives instead.
  const shownSeries = new Set();
  ranked = ranked.filter((c) => {
    const key = seriesKey(c.place);
    if (shownSeries.has(key)) return false;
    shownSeries.add(key);
    return true;
  });

  // G3: every scored window of the same place / same show, best true score first.
  /** @type {Map<string, typeof scored>} */
  const bySeries = new Map();
  for (const s of scored) {
    const key = seriesKey(s.place);
    const list = bySeries.get(key);
    if (list) list.push(s);
    else bySeries.set(key, [s]);
  }
  for (const list of bySeries.values()) list.sort((a, b) => b.baseScore - a.baseScore);

  const cards = ranked.map((c) => {
    const card = toCard(c, ctx, pass >= 3 ? `:p${pass}` : "");
    const alternatives = alternativesFor(c, bySeries, ctx);
    return alternatives?.length ? { ...card, alternatives } : card;
  });

  if (!opts.debug) return { cards };
  return {
    cards,
    debug: {
      ticks: ticks.length,
      windows,
      candidates: candidates.length,
      places: ranked.length,
      dropped,
      // What the user has taught the feed so far (Part 10), e.g. { "cat:bar": -0.5, bars: -0.25 }.
      tagWeights: ctx.tagWeights,
      pass,
      ms: Math.round(performance.now() - t0),
    },
  };
}
