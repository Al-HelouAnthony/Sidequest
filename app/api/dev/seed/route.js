/**
 * POST /api/dev/seed: wipe + reseed the demo data (lib/data/seed.js). Owner: Adel.
 *
 *   curl -X POST http://localhost:3000/api/dev/seed -H "x-seed-secret: <SEED_SECRET>"
 *
 * Only works when DEMO_MODE is on AND the x-seed-secret header matches SEED_SECRET.
 * Otherwise 404, so the route is invisible in production.
 */
import { timingSafeEqual } from "node:crypto";
import { DEMO_MODE } from "@/lib/auth";
import { seedDemo } from "@/lib/data/seed";
import { jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

/** ORS + ~10 Supabase calls; give Vercel more than the default. */
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
  if (!DEMO_MODE || !secretMatches(request.headers.get("x-seed-secret"), process.env.SEED_SECRET)) {
    return jsonError(404, "Not found");
  }
  const started = Date.now();
  try {
    const summary = await seedDemo(createAdminClient());
    return Response.json({ ok: true, ms: Date.now() - started, ...summary });
  } catch (err) {
    console.error("[api/dev/seed]", err);
    return jsonError(500, "Seed failed", err instanceof Error ? err.message : String(err));
  }
}
