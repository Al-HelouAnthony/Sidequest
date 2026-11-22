/**
 * G5: opt-in "on my way" status for a plan. Owner: Mhammad. Used by app/api/plans/[id]/location(s).
 *
 * Privacy (PLAN.md §13, non-negotiable): members only; positions accepted only from 30 min before the
 * start to 30 min after; others get a STATUS + distance + ETA, NEVER coordinates; rows are deleted once
 * the plan has ended. At most one update per 15 s per person.
 * USE_MOCK_DATA=true: kept in memory. USE_MOCK_DATA=false: `plan_locations` (Adel's migration 0007),
 * upserted on (plan_id, user_id), + a data-free plan signal so the other phones refetch.
 */
import { USE_MOCK_DATA, getPlace } from "@/lib/data";
import { estimateTravelMin, haversineKm } from "@/lib/data/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanError, loadPlanForMember } from "./plans-store";
import { notifyPlanChanged } from "./realtime";

const WINDOW_MS = 30 * 60_000; // before and after the start
const MIN_GAP_MS = 15_000; // one update per 15 s
const STALE_MS = 5 * 60_000; // no update for 5 min → "not-sharing"
const ARRIVED_M = 150; // within 150 m of the place → "arrived"

/** @typedef {{ lat: number, lng: number, accuracyM: number, updatedAt: string }} Fix */
/** @typedef {{ userId: string, status: "sharing" | "arrived" | "late" | "not-sharing", distanceM?: number, etaMin?: number, updatedAt?: string }} MemberLocation */

/** planId → userId → last fix. @type {Map<string, Map<string, Fix>>} */
const mem = (globalThis.__sqLocations ??= new Map());

/** @type {ReturnType<typeof createAdminClient> | null} */
let client = null;
const db = () => (client ??= createAdminClient());

/** @param {string} op @param {{ message: string } | null | undefined} error */
function failIf(op, error) {
  if (!error) return;
  console.error(`[locations] ${op} failed: ${error.message}`);
  throw new PlanError("Live location isn't available right now. Try again.", 503);
}

const store = {
  /** @param {string} planId @returns {Promise<Map<string, Fix>>} */
  async fixes(planId) {
    if (USE_MOCK_DATA) return new Map(mem.get(planId) ?? []);
    const { data, error } = await db().from("plan_locations").select("user_id, lat, lng, accuracy_m, updated_at").eq("plan_id", planId);
    failIf("plan_locations.select", error);
    return new Map((data ?? []).map((r) => [r.user_id, { lat: r.lat, lng: r.lng, accuracyM: r.accuracy_m, updatedAt: new Date(r.updated_at).toISOString() }]));
  },
  /** @param {string} planId @param {string} userId @param {Fix} fix */
  async save(planId, userId, fix) {
    if (USE_MOCK_DATA) {
      if (!mem.has(planId)) mem.set(planId, new Map());
      /** @type {Map<string, Fix>} */ (mem.get(planId)).set(userId, fix);
      return;
    }
    const row = { plan_id: planId, user_id: userId, lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracyM, updated_at: fix.updatedAt };
    const { error } = await db().from("plan_locations").upsert(row, { onConflict: "plan_id,user_id" });
    failIf("plan_locations.upsert", error);
  },
  /** Delete every position for this plan (it's over). @param {string} planId */
  async clear(planId) {
    if (USE_MOCK_DATA) return void mem.delete(planId);
    const { error } = await db().from("plan_locations").delete().eq("plan_id", planId);
    failIf("plan_locations.delete", error);
  },
};

/**
 * Status for one member, computed on the server so coordinates never leave it.
 * @param {string} userId @param {Fix | undefined} fix @param {{ lat: number, lng: number }} place
 * @param {number} startMs @param {number} now
 * @returns {MemberLocation}
 */
export function memberStatus(userId, fix, place, startMs, now) {
  if (!fix || now - Date.parse(fix.updatedAt) > STALE_MS) return { userId, status: "not-sharing" };
  const km = haversineKm(fix.lat, fix.lng, place.lat, place.lng);
  const distanceM = Math.round(km * 1000);
  if (distanceM <= ARRIVED_M) return { userId, status: "arrived", distanceM, etaMin: 0, updatedAt: fix.updatedAt };
  const etaMin = estimateTravelMin(km);
  const late = now + etaMin * 60_000 > startMs; // won't make it by the start
  return { userId, status: late ? "late" : "sharing", distanceM, etaMin, updatedAt: fix.updatedAt };
}

/**
 * POST: my position (opt-in, inside the window, ≤ 1 per 15 s).
 * @param {string} userId from getSessionUserId()
 * @param {string} planId
 * @param {{ lat: number, lng: number, accuracyM: number }} pos already checked with LocationRequest
 * @param {number} [now] for tests
 */
export async function shareLocation(userId, planId, pos, now = Date.now()) {
  const { plan, members } = await loadPlanForMember(userId, planId); // 404 / 403
  if (plan.status === "cancelled") throw new PlanError("This plan was cancelled", 409);
  const startMs = Date.parse(plan.startAt);
  if (now > Date.parse(plan.endAt)) {
    await store.clear(planId);
    throw new PlanError("This plan is over", 409);
  }
  if (now < startMs - WINDOW_MS) throw new PlanError("Location sharing opens 30 minutes before the plan", 409);
  if (now > startMs + WINDOW_MS) throw new PlanError("Location sharing closed 30 minutes after the start", 409);
  const previous = (await store.fixes(planId)).get(userId);
  if (previous && now - Date.parse(previous.updatedAt) < MIN_GAP_MS) throw new PlanError("One update every 15 seconds", 429);
  await store.save(planId, userId, { lat: pos.lat, lng: pos.lng, accuracyM: Math.round(pos.accuracyM), updatedAt: new Date(now).toISOString() });
  if (!USE_MOCK_DATA) await notifyPlanChanged(planId, members.map((m) => m.userId)); // data-free: others refetch
}

/**
 * GET: every member's status / distance / ETA (no coordinates). After the plan: positions deleted.
 * @param {string} userId from getSessionUserId()
 * @param {string} planId
 * @param {number} [now] for tests
 * @returns {Promise<MemberLocation[]>}
 */
export async function planLocations(userId, planId, now = Date.now()) {
  const { plan, members } = await loadPlanForMember(userId, planId); // 404 / 403
  const startMs = Date.parse(plan.startAt);
  const open = now >= startMs - WINDOW_MS && now <= startMs + WINDOW_MS && plan.status !== "cancelled";
  if (now > Date.parse(plan.endAt)) await store.clear(planId);
  if (!open) return members.map((m) => ({ userId: m.userId, status: /** @type {const} */ ("not-sharing") }));
  const place = await getPlace(plan.placeId);
  if (!place) throw new PlanError("Place not found", 404);
  const fixes = await store.fixes(planId);
  return members.map((m) => memberStatus(m.userId, fixes.get(m.userId), place, startMs, now));
}
