/**
 * Plans store. Owner: Mhammad.
 * USE_MOCK_DATA=true: in memory (demo backup). USE_MOCK_DATA=false: Supabase plans + plan_members (PLAN.md S1).
 * Same four functions and return shapes either way, so routes, usePlan and Oscar's screens don't change.
 *
 * Rule: the creator is always "in". A plan is "confirmed" as soon as ONE invitee says "in",
 * "cancelled" when every invitee says "out", otherwise "pending".
 * Supabase writes use the admin client (Adel's grants allow no other writes), always after the
 * membership check with the id from getSessionUserId(). A failed DB call is a clear 503, never a silent fallback.
 * Note: POST /api/dev/seed deletes all plans on purpose (clean demo).
 */
import { randomUUID } from "node:crypto";
import { USE_MOCK_DATA, getPlace, getUsers } from "@/lib/data";
import { planMemberToRow, planToRow, rowToPlan, rowToPlanMember } from "@/lib/data/mappers";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPlanChanged } from "./realtime";

/** @typedef {import("@/types/domain").PlanT} PlanT */
/** @typedef {import("@/types/domain").PlanMemberT} PlanMemberT */
/** @typedef {import("@/types/api").PlanViewT} PlanViewT */

/** Thrown for expected failures; routes turn it into a JSON error with `status`. */
export class PlanError extends Error {
  /** @param {string} message @param {400 | 403 | 404 | 503} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * The plan rule, shared by both stores.
 * @param {string} creatorId
 * @param {PlanMemberT[]} members
 * @returns {PlanT["status"]}
 */
export function computeStatus(creatorId, members) {
  const invitees = members.filter((m) => m.userId !== creatorId);
  if (invitees.some((m) => m.rsvp === "in")) return "confirmed";
  if (invitees.length > 0 && invitees.every((m) => m.rsvp === "out")) return "cancelled";
  return "pending";
}

// ---------------------------------------------------------------------------
// Store 1: in memory (USE_MOCK_DATA=true)
// ---------------------------------------------------------------------------

/** @type {{ plans: PlanT[], members: PlanMemberT[] }} */
const mem = (globalThis.__sqPlans ??= { plans: [], members: [] });

const memoryStore = {
  /** @param {PlanT} plan @param {PlanMemberT[]} members */
  async insertPlan(plan, members) {
    mem.plans.push({ ...plan });
    mem.members.push(...members.map((m) => ({ ...m })));
  },
  /** @param {string} id @returns {Promise<PlanT | null>} */
  async findPlan(id) {
    const plan = mem.plans.find((p) => p.id === id);
    return plan ? { ...plan } : null;
  },
  /** @param {string[]} planIds @returns {Promise<PlanMemberT[]>} */
  async membersOf(planIds) {
    return mem.members.filter((m) => planIds.includes(m.planId)).map((m) => ({ ...m }));
  },
  /** @param {string} userId @returns {Promise<string[]>} */
  async planIdsOf(userId) {
    return [...new Set(mem.members.filter((m) => m.userId === userId).map((m) => m.planId))];
  },
  /** @param {string[]} ids @returns {Promise<PlanT[]>} */
  async plansByIds(ids) {
    return mem.plans
      .filter((p) => ids.includes(p.id))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      .map((p) => ({ ...p }));
  },
  /** @param {string} planId @param {string} userId @param {"in" | "out"} rsvp */
  async setMemberRsvp(planId, userId, rsvp) {
    const m = mem.members.find((x) => x.planId === planId && x.userId === userId);
    if (m) m.rsvp = rsvp;
  },
  /** @param {string} planId @param {PlanT["status"]} status */
  async setPlanStatus(planId, status) {
    const p = mem.plans.find((x) => x.id === planId);
    if (p) p.status = status;
  },
};

// ---------------------------------------------------------------------------
// Store 2: Supabase (USE_MOCK_DATA=false)
// ---------------------------------------------------------------------------

const PLAN_COLS = "id, creator_id, place_id, start_at, end_at, status, created_at";
const MEMBER_COLS = "plan_id, user_id, rsvp";
const FK_VIOLATION = "23503";
const BAD_UUID = "22P02";

/** @type {ReturnType<typeof createAdminClient> | null} */
let client = null;
const db = () => (client ??= createAdminClient());

/**
 * Log the real error on the server, give the user a clear message.
 * @param {string} op
 * @param {{ message: string, code?: string } | null} error
 */
function failIf(op, error) {
  if (!error) return;
  console.error(`[plans] ${op} failed${error.code ? ` (${error.code})` : ""}: ${error.message}`);
  throw new PlanError("Couldn't reach the plans database. Try again.", 503);
}

const supabaseStore = {
  /**
   * Insert the plan, then the members. If the members fail, delete the plan (no transactions over REST).
   * @param {PlanT} plan @param {PlanMemberT[]} members
   */
  async insertPlan(plan, members) {
    const { error } = await db().from("plans").insert(planToRow(plan));
    failIf("plans.insert", error);
    const { error: mErr } = await db().from("plan_members").insert(members.map(planMemberToRow));
    if (mErr) {
      await db().from("plans").delete().eq("id", plan.id); // members cascade
      if (mErr.code === FK_VIOLATION) throw new PlanError("Unknown invitee", 400);
      failIf("plan_members.insert", mErr);
    }
  },
  /** @param {string} id @returns {Promise<PlanT | null>} */
  async findPlan(id) {
    const { data, error } = await db().from("plans").select(PLAN_COLS).eq("id", id).maybeSingle();
    if (error?.code === BAD_UUID) return null; // not a valid id → "not found"
    failIf("plans.select", error);
    return data ? rowToPlan(data) : null;
  },
  /** @param {string[]} planIds @returns {Promise<PlanMemberT[]>} */
  async membersOf(planIds) {
    if (planIds.length === 0) return [];
    const { data, error } = await db().from("plan_members").select(MEMBER_COLS).in("plan_id", planIds);
    failIf("plan_members.select", error);
    return (data ?? []).map(rowToPlanMember);
  },
  /** @param {string} userId @returns {Promise<string[]>} */
  async planIdsOf(userId) {
    const { data, error } = await db().from("plan_members").select("plan_id").eq("user_id", userId);
    failIf("plan_members.select", error);
    return [...new Set((data ?? []).map((r) => r.plan_id))];
  },
  /** @param {string[]} ids @returns {Promise<PlanT[]>} */
  async plansByIds(ids) {
    if (ids.length === 0) return [];
    const { data, error } = await db().from("plans").select(PLAN_COLS).in("id", ids).order("start_at");
    failIf("plans.select", error);
    return (data ?? []).map(rowToPlan);
  },
  /**
   * Upsert on the (plan_id, user_id) key, as Adel suggested. Only called after the membership check.
   * @param {string} planId @param {string} userId @param {"in" | "out"} rsvp
   */
  async setMemberRsvp(planId, userId, rsvp) {
    const { error } = await db()
      .from("plan_members")
      .upsert(planMemberToRow({ planId, userId, rsvp }), { onConflict: "plan_id,user_id" });
    failIf("plan_members.upsert", error);
  },
  /** @param {string} planId @param {PlanT["status"]} status */
  async setPlanStatus(planId, status) {
    const { error } = await db().from("plans").update({ status }).eq("id", planId);
    failIf("plans.update", error);
  },
};

const store = () => (USE_MOCK_DATA ? memoryStore : supabaseStore);

/**
 * Live update to every member (S2). Supabase mode only: mock mode just polls. Never throws.
 * Awaited by callers because Vercel can stop work that is still running after the response.
 * @param {string} planId @param {PlanMemberT[]} members
 */
const notify = (planId, members) =>
  USE_MOCK_DATA ? Promise.resolve() : notifyPlanChanged(planId, members.map((m) => m.userId));

// ---------------------------------------------------------------------------
// The four functions the routes use (same names and shapes as before)
// ---------------------------------------------------------------------------

/** @param {PlanT} plan @param {PlanMemberT[]} members @returns {Promise<PlanViewT>} */
async function toView(plan, members) {
  const place = await getPlace(plan.placeId);
  if (!place) throw new PlanError("Place not found", 404);
  const users = await getUsers(members.map((m) => m.userId));
  return {
    ...plan,
    place: { id: place.id, name: place.name, category: place.category, photoUrl: place.photoUrl, address: place.address },
    members: members.map((m) => {
      const u = users.find((x) => x.id === m.userId);
      return {
        userId: m.userId,
        name: u?.name ?? "Unknown",
        avatarUrl: u?.avatarUrl ?? "",
        rsvp: m.rsvp,
        isCreator: m.userId === plan.creatorId,
      };
    }),
  };
}

/**
 * @param {string} creatorId
 * @param {import("@/types/api").CreatePlanRequestT} input
 * @returns {Promise<PlanViewT>}
 */
export async function createPlan(creatorId, input) {
  if (!(await getPlace(input.placeId))) throw new PlanError("Unknown place", 400);
  if (Date.parse(input.end) <= Date.parse(input.start)) throw new PlanError("end must be after start", 400);
  /** @type {PlanT} */
  const plan = {
    id: randomUUID(),
    creatorId,
    placeId: input.placeId,
    startAt: input.start,
    endAt: input.end,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  /** @type {PlanMemberT[]} */
  const members = [{ planId: plan.id, userId: creatorId, rsvp: "in" }];
  for (const id of new Set(input.inviteeIds)) {
    if (id !== creatorId) members.push({ planId: plan.id, userId: id, rsvp: "invited" });
  }
  await store().insertPlan(plan, members);
  await notify(plan.id, members);
  return toView(plan, members);
}

/** Plans the user is a member of, upcoming first. @param {string} userId @returns {Promise<PlanViewT[]>} */
export async function listPlans(userId) {
  const s = store();
  const ids = await s.planIdsOf(userId);
  if (ids.length === 0) return [];
  const [plans, members] = await Promise.all([s.plansByIds(ids), s.membersOf(ids)]);
  return Promise.all(plans.map((p) => toView(p, members.filter((m) => m.planId === p.id))));
}

/**
 * Loads a plan and checks the user is in it.
 * @param {string} userId @param {string} planId
 */
async function loadForMember(userId, planId) {
  const s = store();
  const plan = await s.findPlan(planId);
  if (!plan) throw new PlanError("Plan not found", 404);
  const members = await s.membersOf([planId]);
  if (!members.some((m) => m.userId === userId)) throw new PlanError("Not a member of this plan", 403);
  return { plan, members };
}

/** @param {string} userId @param {string} planId @returns {Promise<PlanViewT>} */
export async function getPlan(userId, planId) {
  const { plan, members } = await loadForMember(userId, planId);
  return toView(plan, members);
}

/** @param {string} userId @param {string} planId @param {"in" | "out"} rsvp @returns {Promise<PlanViewT>} */
export async function setRsvp(userId, planId, rsvp) {
  const { plan, members } = await loadForMember(userId, planId);
  await store().setMemberRsvp(planId, userId, rsvp);
  const updated = members.map((m) => (m.userId === userId ? { ...m, rsvp } : m));
  const status = computeStatus(plan.creatorId, updated);
  if (status !== plan.status) await store().setPlanStatus(planId, status);
  await notify(planId, updated);
  return toView({ ...plan, status }, updated);
}
