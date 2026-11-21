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

/**
 * @param {import("./candidates").Candidate & { score: number, baseScore?: number, breakdown: import("@/types/feed").ScoreBreakdownT }} c
 * @param {EngineContext} ctx
 * @param {string} [idSuffix]
 * @returns {FeedCardT}
 */
function toCard(c, ctx, idSuffix = "") {
  const slot = { start: new Date(c.startMs).toISOString(), end: new Date(c.endMs).toISOString() };
  const friends = c.friendIds.map((id) => {
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
    return { ...c, breakdown, baseScore: score, score: score + jitter - seenDrop, day: ticks[c.startTick].dayIndex };
  });
  const perPlace = bestWindowsPerPlace(scored);
  const primary = diversify(perPlace);

  let ranked = primary;
  if (pass === 2) {
    // Each place's OTHER good slot (another day), for places that have one.
    const shown = new Map(primary.map((c) => [c.place.id, c.day]));
    ranked = diversify(perPlace.filter((w) => shown.has(w.place.id) && w.day !== shown.get(w.place.id)));
  }
  const cards = ranked.map((c) => toCard(c, ctx, pass >= 3 ? `:p${pass}` : ""));

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
