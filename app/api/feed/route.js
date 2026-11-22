/**
 * GET /api/feed?cursor=<pass:offset>&filters=<url-encoded JSON FeedFilters>&seed=<int>&seen=<id,id,…>&debug=1
 * Owner: Anthony. Response: FeedResponse (types/api.js), plus `debug` when debug=1.
 * N2: `seed` + `seen` vary the order per visit (card scores stay true).
 * N3: endless — pass 1 best slot per place, pass 2 other good slots, pass ≥ 3 loop (unfiltered feeds only).
 */
import { after } from "next/server";
import { FeedFilters } from "@/types/feed";
import { FeedVisitParams } from "@/types/api";
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { nowLocal } from "@/lib/time";
import { ENGINE } from "@/lib/engine/config";
import { loadContext } from "@/lib/engine/load";
import { buildFeed } from "@/lib/engine";
import { nextCursor, parseCursor } from "@/lib/engine/variety";
import { attachCaptions } from "@/lib/engine/attachCaptions";
import { captionCards } from "@/lib/ai/captions";
import { ServerTiming } from "@/lib/serverTiming";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Work that should finish after the response: after() in a request (Vercel keeps it alive);
 * outside one (tests, scripts) it just runs detached. Never throws.
 * @param {() => Promise<unknown>} job
 */
function background(job) {
  try {
    after(job);
  } catch {
    job().catch(() => {});
  }
}

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

  const visit = FeedVisitParams.safeParse({
    seed: params.get("seed") ?? undefined,
    seen: params.get("seen")?.split(",").filter((id) => UUID.test(id)),
  });
  if (!visit.success) return jsonError(400, "Invalid seed/seen");
  const { seed, seen } = visit.data;

  const timing = new ServerTiming();
  const ctx = await timing.measure("load", () => loadContext(userId, nowLocal(), { cuisine: filters.cuisine }));
  if (!ctx) return jsonError(404, "User not found");

  const debug = params.get("debug") === "1";
  const { pass, offset } = parseCursor(params.get("cursor"));
  const { cards, pass2Length, info } = await timing.measure("engine", async () => {
    const built = buildFeed(ctx, { filters, debug, seed, seen, pass });
    // Only needed when pass 1 ends: does pass 2 have anything?
    const p2 = pass === 1 && offset + ENGINE.pageSize >= built.cards.length ? buildFeed(ctx, { filters, seed, seen, pass: 2 }).cards.length : 0;
    return { cards: built.cards, pass2Length: p2, info: built.debug };
  });

  // Claude captions only for the cards on this page (Part 11c); templates if Claude is slow or down.
  // If Claude is slower than the budget, after() keeps the job alive past the response (Vercel would freeze it).
  const { cards: page, info: captions } = await timing.measure("captions", () =>
    attachCaptions(cards.slice(offset, offset + ENGINE.pageSize), captionCards, undefined, (pending) => background(() => pending)),
  );
  // G6b: caption the NEXT page in the background after responding, so the page the client prefetches
  // (and repeat visits) already have Claude captions in the cache. captionCards never throws.
  const nextPage = cards.slice(offset + ENGINE.pageSize, offset + 2 * ENGINE.pageSize);
  if (nextPage.length > 0) background(() => captionCards(nextPage));

  const filtered = Object.keys(filters).length > 0;
  return Response.json(
    {
      cards: page,
      nextCursor: nextCursor({ pass, offset, pageSize: ENGINE.pageSize, length: cards.length, pass2Length, filtered }),
      ...(debug ? { debug: { ...info, captions } } : {}),
    },
    { headers: { "Server-Timing": timing.header() } },
  );
}
