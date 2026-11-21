/**
 * POST /api/search { query } → SearchResponse. Owner: Mhammad.
 * Plain-code search: lib/ai/search.js turns the words into FeedFilters, then Anthony's engine ranks.
 *
 * - Cuisines (N1): filters.cuisine. Anthony's addCuisinePlaces adds that cuisine's registry restaurants near
 *   me, and the engine keeps only places tagged with it. GET /api/feed rebuilds the same thing from the
 *   filters, so "load more" works (nextCursor from Anthony's nextCursor(), "pass:offset").
 * - Other specific things ("museum", "karaoke"…): the engine can't filter those, so only places whose
 *   name/tags match are kept HERE. The feed route can't repeat that, so those return one page (nextCursor null).
 * - Nothing matches → fall back to the things' categories, and the summary says so
 *   ("No bowling nearby · showing Activities"). That's a plain category filter, so "load more" works again.
 * - Words search doesn't understand ("hotel", "o four", "schwartz") → name search over the places, plus the
 *   registry by name once Adel's searchRegistryByName exists. No place called that → honest chip
 *   ("Nothing called “hotel” nearby · showing all suggestions") and the other filters' results.
 */
import { after } from "next/server";
import { SearchRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { nowLocal } from "@/lib/time";
import * as dataLayer from "@/lib/data";
import { getFriends } from "@/lib/data";
import { ENGINE } from "@/lib/engine/config";
import { addCuisinePlaces, loadContext } from "@/lib/engine/load";
import { withExtraPlaces } from "@/lib/engine/context";
import { buildFeed } from "@/lib/engine";
import { nextCursor } from "@/lib/engine/variety";
import { attachCaptions } from "@/lib/engine/attachCaptions";
import { captionCards } from "@/lib/ai/captions";
import { nameMatches, parseSearch } from "@/lib/ai/search";
import { placeMatches } from "@/lib/ai/searchTerms";

/** Looked up by name: Adel is adding it (registry restaurants whose NAME contains the words). */
const SEARCH_REGISTRY_BY_NAME = "searchRegistryByName";

/**
 * Add registry restaurants whose name matches (e.g. "o four"), with straight-line travel estimates.
 * Never throws: function not merged yet / registry down → curated places only.
 * @template {import("@/lib/engine/context").EngineContext} Ctx
 * @param {Ctx} ctx @param {string} text
 * @returns {Promise<Ctx>}
 */
async function addPlacesByName(ctx, text) {
  /** @type {any} */
  const search = /** @type {any} */ (dataLayer)[SEARCH_REGISTRY_BY_NAME];
  if (typeof search !== "function") return ctx;
  try {
    const found = await search({ text, near: { lat: ctx.me.homeLat, lng: ctx.me.homeLng } });
    return /** @type {Ctx} */ (withExtraPlaces(ctx, found));
  } catch (e) {
    console.warn(`[search] registry name search for "${text}" skipped:`, e instanceof Error ? e.message : e);
    return ctx;
  }
}

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, SearchRequest);
  if (response) return response;

  const now = nowLocal();
  const [loaded, friends] = await Promise.all([loadContext(userId, now), getFriends(userId)]);
  if (!loaded) return jsonError(404, "User not found");

  const { filters, summary, what, fallbackSummary, nameQuery, nameFallbackSummary } = parseSearch(data.query, {
    now,
    friends: friends.map((f) => f.user),
  });
  // N1: registry restaurants of that cuisine near me (never throws: registry down → curated places only).
  let ctx = (await addCuisinePlaces(loaded, filters.cuisine)) ?? loaded;
  // Unknown words: registry restaurants with that name too (never throws).
  if (nameQuery) ctx = await addPlacesByName(ctx, nameQuery);

  let finalFilters = filters;
  let finalSummary = summary;
  let { cards } = buildFeed(ctx, { filters });

  // Specific things the engine doesn't filter on (cuisines it does, via filters.cuisine).
  const matchHere = what.filter((t) => !t.cuisine);
  let matchedHere = false;
  if (matchHere.length > 0) {
    const specific = cards.filter((c) => placeMatches(c.place, matchHere));
    if (specific.length > 0) {
      cards = specific;
      matchedHere = true;
    }
  }

  // Nothing for the specific things ("bowling", or no Indian place with a free friend): show their categories.
  const nothingFound = (what.length > 0 && cards.length === 0) || (matchHere.length > 0 && !matchedHere);
  if (nothingFound) {
    const rest = { ...filters };
    delete rest.cuisine;
    finalFilters = { ...rest, categories: [...new Set(what.map((t) => t.category))] };
    cards = buildFeed(ctx, { filters: finalFilters }).cards;
    finalSummary = fallbackSummary ?? summary;
    matchedHere = false;
  }

  // Name search for words we didn't understand: keep places called that, or say honestly there are none.
  if (nameQuery) {
    const named = cards.filter((c) => nameMatches(c.place.name, nameQuery));
    if (named.length > 0) {
      cards = named;
      matchedHere = true;
    } else {
      finalSummary = nameFallbackSummary ?? summary;
    }
  }

  // Claude captions for the first page; if Claude is slower than the budget, after() keeps it alive (Vercel).
  const { cards: page } = await attachCaptions(cards.slice(0, ENGINE.pageSize), captionCards, undefined, (pending) =>
    after(() => pending),
  );

  // "Load more" through GET /api/feed with the same filters, unless the matching was done here.
  const pass2Length = !matchedHere && ENGINE.pageSize >= cards.length ? buildFeed(ctx, { filters: finalFilters, pass: 2 }).cards.length : 0;
  const cursor = matchedHere
    ? null
    : nextCursor({ pass: 1, offset: 0, pageSize: ENGINE.pageSize, length: cards.length, pass2Length, filtered: true });

  return Response.json({ filters: finalFilters, summary: finalSummary, cards: page, nextCursor: cursor });
}
