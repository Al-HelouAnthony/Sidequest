/**
 * POST /api/search  { query }  →  SearchResponse
 * Owner: Mhammad. STUB: ignores the query and returns mock cards with empty filters.
 * TODO: lib/ai/search.js → Claude → validated FeedFilters → engine.
 */
import { SearchRequest } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { buildMockFeedCards } from "@/lib/mocks/feedCards";

/** @param {Request} request */
export async function POST(request) {
  await getSessionUserId();
  const { data, response } = await parseBody(request, SearchRequest);
  if (response) return response;
  return Response.json({
    filters: {},
    summary: `(stub) "${data.query}"`,
    cards: buildMockFeedCards().slice(0, 5),
    nextCursor: null,
  });
}
