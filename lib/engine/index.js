/**
 * Part 9: buildFeed(). The whole engine pipeline. Pure (data comes in via ctx). Owner: Anthony.
 *
 *   ticks → candidates (hard constraints) → score → best per place → diversify → FeedCard[]
 *
 * Called by /api/feed and (later) Mhammad's /api/search with { filters }.
 */
import { templateCaption } from "@/lib/ai/templates";
import { buildTicks } from "./slots";
import { generateCandidates } from "./candidates";
import { scoreCandidate } from "./scoring";
import { bestPerPlace, diversify } from "./diversify";
import { travelKey } from "./context";

/** @typedef {import("./context").EngineContext} EngineContext */
/** @typedef {import("@/types/feed").FeedCardT} FeedCardT */

const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * @param {import("./candidates").Candidate & { score: number, breakdown: import("@/types/feed").ScoreBreakdownT }} c
 * @param {EngineContext} ctx
 * @returns {FeedCardT}
 */
function toCard(c, ctx) {
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
    id: `${p.id}:${slot.start}`,
    place: { id: p.id, name: p.name, category: p.category, photoUrl: p.photoUrl, priceLevel: p.priceLevel, lat: p.lat, lng: p.lng, address: p.address, tags: p.tags },
    slot,
    myTravelMin: c.myMin,
    friends,
    weather: c.weather,
    score: round3(c.score),
    breakdown,
    caption: templateCaption({ friends, weather: c.weather, myTravelMin: c.myMin }),
  };
}

/**
 * @param {EngineContext} ctx
 * @param {{ filters?: import("@/types/feed").FeedFiltersT, debug?: boolean }} [opts]
 * @returns {{ cards: FeedCardT[], debug?: { ticks: number, windows: number, candidates: number, places: number, dropped: Record<string, number>, tagWeights: import("@/types/domain").TagWeightsT, ms: number } }}
 */
export function buildFeed(ctx, opts = {}) {
  const t0 = performance.now(); // duration only; the engine never reads the time of day
  const filters = opts.filters ?? {};

  let ticks = buildTicks(ctx.now);
  if (filters.dateRange) {
    const from = Date.parse(filters.dateRange.start);
    const to = Date.parse(filters.dateRange.end);
    ticks = ticks.filter((t) => t.startMs >= from && t.endMs <= to).map((t, i) => ({ ...t, i }));
  }

  const { candidates, dropped, windows } = generateCandidates(ctx, ticks, filters);
  const scored = candidates.map((c) => ({ ...c, ...scoreCandidate(c, ctx) }));
  const ranked = diversify(bestPerPlace(scored));
  const cards = ranked.map((c) => toCard(c, ctx));

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
      ms: Math.round(performance.now() - t0),
    },
  };
}
