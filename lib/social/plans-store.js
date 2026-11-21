/**
 * MOCK plans store (in memory). Owner: Mhammad.
 * Lets Oscar build the plan screens today. In the social phase Mhammad replaces
 * these functions with Supabase queries (plans + plan_members), same names and return shapes.
 *
 * Rule: a plan becomes "confirmed" as soon as ONE invitee says "in"
 * (the creator is always "in"). If every invitee says "out" it becomes "cancelled".
 */
import { randomUUID } from "node:crypto";
import { getPlace, getUsers } from "@/lib/data";

/** @typedef {import("@/types/domain").PlanT} PlanT */
/** @typedef {import("@/types/domain").PlanMemberT} PlanMemberT */
/** @typedef {import("@/types/api").PlanViewT} PlanViewT */

/** @type {{ plans: PlanT[], members: PlanMemberT[] }} */
const store = (globalThis.__sqPlans ??= { plans: [], members: [] });

/** Thrown for expected failures; routes turn it into a JSON error with `status`. */
export class PlanError extends Error {
  /** @param {string} message @param {400 | 403 | 404} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** @param {PlanT} plan @returns {Promise<PlanViewT>} */
async function toView(plan) {
  const place = await getPlace(plan.placeId);
  if (!place) throw new PlanError("Place not found", 404);
  const members = store.members.filter((m) => m.planId === plan.id);
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
  store.plans.push(plan);
  store.members.push({ planId: plan.id, userId: creatorId, rsvp: "in" });
  for (const id of new Set(input.inviteeIds)) {
    if (id !== creatorId) store.members.push({ planId: plan.id, userId: id, rsvp: "invited" });
  }
  return toView(plan);
}

/** Plans the user is a member of, upcoming first. @param {string} userId @returns {Promise<PlanViewT[]>} */
export async function listPlans(userId) {
  const ids = new Set(store.members.filter((m) => m.userId === userId).map((m) => m.planId));
  const plans = store.plans.filter((p) => ids.has(p.id)).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  return Promise.all(plans.map(toView));
}

/** @param {string} userId @param {string} planId @returns {Promise<PlanViewT>} */
export async function getPlan(userId, planId) {
  const plan = store.plans.find((p) => p.id === planId);
  if (!plan) throw new PlanError("Plan not found", 404);
  if (!store.members.some((m) => m.planId === planId && m.userId === userId)) {
    throw new PlanError("Not a member of this plan", 403);
  }
  return toView(plan);
}

/** @param {string} userId @param {string} planId @param {"in" | "out"} rsvp @returns {Promise<PlanViewT>} */
export async function setRsvp(userId, planId, rsvp) {
  const plan = store.plans.find((p) => p.id === planId);
  if (!plan) throw new PlanError("Plan not found", 404);
  const member = store.members.find((m) => m.planId === planId && m.userId === userId);
  if (!member) throw new PlanError("Not a member of this plan", 403);
  member.rsvp = rsvp;

  const invitees = store.members.filter((m) => m.planId === planId && m.userId !== plan.creatorId);
  if (invitees.some((m) => m.rsvp === "in")) plan.status = "confirmed";
  else if (invitees.every((m) => m.rsvp === "out")) plan.status = "cancelled";
  else plan.status = "pending";
  return toView(plan);
}
