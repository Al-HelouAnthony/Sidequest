/**
 * POST /api/dev/seed/places: refresh ONLY the curated places + their travel times from
 * data/places.json (lib/data/seed.js refreshPlaces). Owner: Adel.
 *
 *   curl -X POST http://localhost:3000/api/dev/seed/places -H "x-seed-secret: <SEED_SECRET>"
 *
 * Unlike /api/dev/seed this is NON-destructive (plans, swipes, weights, friendships, users and busy
 * blocks are untouched), so it only needs the x-seed-secret header, not DEMO_MODE: it can run while the
 * team is testing, and with DEMO_MODE=false. Wrong or missing secret → 404 (invisible in production).
 */
import { timingSafeEqual } from "node:crypto";
import { refreshPlaces } from "@/lib/data/seed";
import { jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

/** ORS + a few Supabase calls; give Vercel more than the default. */
export const maxDuration = 60;

/** @param {string | null} given @param {string | undefined} expected */
function secretMatches(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** @param {Request} request */
export async function POST(request) {
  if (!secretMatches(request.headers.get("x-seed-secret"), process.env.SEED_SECRET)) return jsonError(404, "Not found");
  const started = Date.now();
  try {
    const summary = await refreshPlaces(createAdminClient());
    return Response.json({ ok: true, ms: Date.now() - started, ...summary });
  } catch (err) {
    console.error("[api/dev/seed/places]", err);
    return jsonError(500, "Places refresh failed", err instanceof Error ? err.message : String(err));
  }
}
