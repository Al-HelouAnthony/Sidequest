/**
 * POST /api/search { query } → SearchResponse. Owner: Mhammad.
 * Plain-code search: lib/ai/search.js turns the words into FeedFilters, then Anthony's engine ranks.
 * Specific things ("bowling", "museum", "pizza"…): only places whose name/tags match are kept. If none
 * match, we fall back to those things' categories and the summary says so ("No bowling nearby · showing Activities").
 * More pages: GET /api/feed?filters=<JSON>&cursor=<nextCursor> (same filters, same ranking). For a specific
 * search the matching happens here, so nextCursor is null (the matches fit on one page).
 */
import { after } from "next/server";
import { SearchRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError, parseBody } from "@/lib/http";
import { nowLocal } from "@/lib/time";
import { getFriends } from "@/lib/data";
import { ENGINE } from "@/lib/engine/config";
import { loadContext } from "@/lib/engine/load";
import { buildFeed } from "@/lib/engine";
import { attachCaptions } from "@/lib/engine/attachCaptions";
import { captionCards } from "@/lib/ai/captions";
import { parseSearch } from "@/lib/ai/search";
import { placeMatches } from "@/lib/ai/searchTerms";

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, SearchRequest);
  if (response) return response;

  const now = nowLocal();
  const [ctx, friends] = await Promise.all([loadContext(userId, now), getFriends(userId)]);
  if (!ctx) return jsonError(404, "User not found");

  const { filters, summary, what, fallbackSummary } = parseSearch(data.query, { now, friends: friends.map((f) => f.user) });
  let { cards } = buildFeed(ctx, { filters });
  let finalSummary = summary;
  let finalFilters = filters;

  if (what.length > 0) {
    const specific = cards.filter((c) => placeMatches(c.place, what));
    if (specific.length > 0) {
      cards = specific;
    } else {
      // Nothing matches "bowling": show the category instead, and say so.
      finalFilters = { ...filters, categories: [...new Set(what.map((t) => t.category))] };
      cards = buildFeed(ctx, { filters: finalFilters }).cards;
      finalSummary = fallbackSummary ?? summary;
    }
  }

  // Claude captions for the first page; if Claude is slower than the budget, after() keeps it alive (Vercel).
  const { cards: page } = await attachCaptions(cards.slice(0, ENGINE.pageSize), captionCards, undefined, (pending) =>
    after(() => pending),
  );
  const morePages = what.length === 0 && cards.length > ENGINE.pageSize;
  return Response.json({
    filters: finalFilters,
    summary: finalSummary,
    cards: page,
    nextCursor: morePages ? String(ENGINE.pageSize) : null,
  });
}
