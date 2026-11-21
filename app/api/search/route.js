/**
 * POST /api/search { query } → SearchResponse. Owner: Mhammad.
 * Plain-code search: lib/ai/search.js turns the words into FeedFilters, then Anthony's engine ranks.
 * More pages: GET /api/feed?filters=<JSON>&cursor=<nextCursor> (same filters, same ranking).
 */
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

/** @param {Request} request */
export async function POST(request) {
  const userId = await getSessionUserId();
  const { data, response } = await parseBody(request, SearchRequest);
  if (response) return response;

  const now = nowLocal();
  const [ctx, friends] = await Promise.all([loadContext(userId, now), getFriends(userId)]);
  if (!ctx) return jsonError(404, "User not found");

  const { filters, summary } = parseSearch(data.query, { now, friends: friends.map((f) => f.user) });
  const { cards } = buildFeed(ctx, { filters });
  const { cards: page } = await attachCaptions(cards.slice(0, ENGINE.pageSize), captionCards);
  return Response.json({
    filters,
    summary,
    cards: page,
    nextCursor: cards.length > ENGINE.pageSize ? String(ENGINE.pageSize) : null,
  });
}
