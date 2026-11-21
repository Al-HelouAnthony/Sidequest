/**
 * Travel times via the OpenRouteService matrix API. Owner: Adel.
 * Precomputed by the seed (lib/data/seed.js) and stored in public.travel_times.
 *
 * Rule (PLAN.md D6): walk; if the walk is longer than 25 min, use cycling as a stand-in
 * for metro/BIXI (ORS has no public transit). Anything ORS can't answer (no key, HTTP
 * error, unroutable pair) falls back to haversine with isEstimate = true.
 * Exactly ONE row per (user, place) pair, so the engine never sees a missing pair.
 * Server-only: uses ROUTING_API_KEY.
 */
import { z } from "zod";
import { estimateTravelMin, haversineKm } from "./geo";

/** @typedef {import("@/types/domain").UserT} UserT */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/domain").TravelTimeT} TravelTimeT */
/** @typedef {"foot-walking" | "cycling-regular"} Profile */

export const ORS_MATRIX_URL = "https://api.openrouteservice.org/v2/matrix";
/** Walks longer than this switch to cycling. */
export const WALK_MAX_MIN = 25;
/** ORS public API caps a matrix at ~3,500 elements (sources × destinations); stay well under. */
const MAX_ELEMENTS = 3000;
const TIMEOUT_MS = 15_000;

const MatrixResponse = z.object({ durations: z.array(z.array(z.number().nullable())) });

/**
 * One ORS matrix call: every user (sources) to every place (destinations), chunked by place.
 * Returns minutes[userIndex][placeIndex] (null = unroutable).
 * @param {Profile} profile
 * @param {UserT[]} users
 * @param {PlaceT[]} places
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<(number | null)[][]>}
 */
export async function orsMatrix(profile, users, places, { apiKey, fetchImpl = fetch }) {
  const chunkSize = Math.max(1, Math.floor(MAX_ELEMENTS / users.length));
  /** @type {(number | null)[][]} */
  const minutes = users.map(() => []);
  for (let offset = 0; offset < places.length; offset += chunkSize) {
    const chunk = places.slice(offset, offset + chunkSize);
    // ORS wants [lng, lat].
    const locations = [...users.map((u) => [u.homeLng, u.homeLat]), ...chunk.map((p) => [p.lng, p.lat])];
    const res = await fetchImpl(`${ORS_MATRIX_URL}/${profile}`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        locations,
        sources: users.map((_, i) => i),
        destinations: chunk.map((_, i) => users.length + i),
        metrics: ["duration"],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ORS ${profile} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const { durations } = MatrixResponse.parse(await res.json());
    durations.forEach((row, u) => {
      for (const sec of row) minutes[u].push(sec == null ? null : Math.max(1, Math.round(sec / 60)));
    });
  }
  return minutes;
}

/**
 * Compute one travel time per (user, place). Never throws for ORS problems: falls back to haversine.
 * @param {UserT[]} users
 * @param {PlaceT[]} places
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ rows: TravelTimeT[], stats: { routed: number, estimated: number, errors: string[] } }>}
 */
export async function computeTravelTimes(users, places, { apiKey = process.env.ROUTING_API_KEY, fetchImpl = fetch } = {}) {
  /** @type {string[]} */
  const errors = [];
  /** @param {Profile} profile */
  const tryMatrix = async (profile) => {
    if (!apiKey) return null;
    try {
      return await orsMatrix(profile, users, places, { apiKey, fetchImpl });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return null;
    }
  };
  if (!apiKey) errors.push("ROUTING_API_KEY not set: all travel times are haversine estimates");

  const walk = await tryMatrix("foot-walking");
  const needsBike = users.length > 0 && places.length > 0 && walk?.some((row) => row.some((m) => m == null || m > WALK_MAX_MIN));
  // If walking failed entirely, cycling would most likely fail the same way: skip it.
  const bike = walk && needsBike ? await tryMatrix("cycling-regular") : null;

  /** @type {TravelTimeT[]} */
  const rows = [];
  let routed = 0;
  users.forEach((u, ui) => {
    places.forEach((p, pi) => {
      const w = walk?.[ui]?.[pi] ?? null;
      const b = bike?.[ui]?.[pi] ?? null;
      /** @type {TravelTimeT} */
      let row;
      if (w != null && w <= WALK_MAX_MIN) row = { userId: u.id, placeId: p.id, minutes: w, mode: "foot-walking", isEstimate: false };
      else if (b != null) row = { userId: u.id, placeId: p.id, minutes: b, mode: "cycling-regular", isEstimate: false };
      else if (w != null) row = { userId: u.id, placeId: p.id, minutes: w, mode: "foot-walking", isEstimate: false };
      else row = estimateRow(u, p);
      if (!row.isEstimate) routed++;
      rows.push(row);
    });
  });
  return { rows, stats: { routed, estimated: rows.length - routed, errors } };
}

/**
 * Haversine fallback row (flagged as an estimate, shown with "~" in the UI).
 * @param {UserT} user
 * @param {PlaceT} place
 * @returns {TravelTimeT}
 */
export function estimateRow(user, place) {
  return {
    userId: user.id,
    placeId: place.id,
    minutes: estimateTravelMin(haversineKm(user.homeLat, user.homeLng, place.lat, place.lng)),
    mode: "foot-walking",
    isEstimate: true,
  };
}
