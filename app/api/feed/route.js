/**
 * GET /api/feed?cursor=<n>&filters=<url-encoded JSON FeedFilters>
 * Owner: Anthony. STUB: returns mock cards. Replace with lib/engine buildFeed().
 * Response shape: FeedResponse (types/api.js).
 */
import { FeedFilters } from "@/types/feed";
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { buildMockFeedCards } from "@/lib/mocks/feedCards";
import { ENGINE } from "@/lib/engine/config";

/** @param {import("next/server").NextRequest} request */
export async function GET(request) {
  await getSessionUserId();
  const params = request.nextUrl.searchParams;

  const rawFilters = params.get("filters");
  if (rawFilters) {
    let json;
    try {
      json = JSON.parse(rawFilters);
    } catch {
      return jsonError(400, "filters must be JSON");
    }
    const parsed = FeedFilters.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid filters");
    // TODO(Anthony): pass parsed.data to the engine.
  }

  const offset = Number(params.get("cursor") ?? 0) || 0;
  const all = buildMockFeedCards();
  const cards = all.slice(offset, offset + ENGINE.pageSize);
  const next = offset + ENGINE.pageSize;
  return Response.json({ cards, nextCursor: next < all.length ? String(next) : null });
}
