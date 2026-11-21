/**
 * GET /api/feed?cursor=<n>&filters=<url-encoded JSON FeedFilters>&debug=1
 * Owner: Anthony. Response: FeedResponse (types/api.js), plus `debug` when debug=1.
 */
import { after } from "next/server";
import { FeedFilters } from "@/types/feed";
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { nowLocal } from "@/lib/time";
import { ENGINE } from "@/lib/engine/config";
import { loadContext } from "@/lib/engine/load";
import { buildFeed } from "@/lib/engine";
import { attachCaptions } from "@/lib/engine/attachCaptions";
import { captionCards } from "@/lib/ai/captions";

/** @param {import("next/server").NextRequest} request */
export async function GET(request) {
  const userId = await getSessionUserId();
  const params = request.nextUrl.searchParams;

  let filters = {};
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
    filters = parsed.data;
  }

  const ctx = await loadContext(userId, nowLocal());
  if (!ctx) return jsonError(404, "User not found");

  const debug = params.get("debug") === "1";
  const { cards, debug: info } = buildFeed(ctx, { filters, debug });

  const offset = Math.max(0, Number(params.get("cursor") ?? 0) || 0);
  // Claude captions only for the cards on this page (Part 11c); templates if Claude is slow or down.
  // If Claude is slower than the budget, after() keeps the job alive past the response (Vercel would freeze it).
  const { cards: page, info: captions } = await attachCaptions(
    cards.slice(offset, offset + ENGINE.pageSize),
    captionCards,
    undefined,
    (pending) => after(() => pending),
  );
  const next = offset + ENGINE.pageSize;
  return Response.json({
    cards: page,
    nextCursor: next < cards.length ? String(next) : null,
    ...(debug ? { debug: { ...info, captions } } : {}),
  });
}
