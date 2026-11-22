/**
 * Plans store. Owner: Mhammad.
 * USE_MOCK_DATA=true: in memory (demo backup). USE_MOCK_DATA=false: Supabase plans + plan_members (PLAN.md S1).
 * Same four functions and return shapes either way, so routes, usePlan and Oscar's screens don't change.
 *
 * Rule: the creator is always "in". A plan is "confirmed" as soon as ONE invitee says "in",
 * "cancelled" when every invitee says "out", otherwise "pending".
 * The organizer can also cancel (cancelPlan). A cancelled plan is final: RSVPs on it get 409.
 * Supabase writes use the admin client (Adel's grants allow no other writes), always after the
 * membership check with the id from getSessionUserId(). A failed DB call is a clear 503, never a silent fallback.
 * Note: POST /api/dev/seed deletes all plans on purpose (clean demo).
 */
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import * as dataLayer from "@/lib/data";
import { addPlanToCalendar, removePlanFromCalendar } from "@/lib/calendar/planEvents";
import {
  DataInputError,
  USE_MOCK_DATA,
  ensurePlaceFromEvent,
  ensurePlaceFromRegistry,
  ensurePlaceFromVenue,
  eventPlaceById,
  getBusyBlocks,
  getPlace,
  getUsers,
  isEventPlaceId,
  isVenuePlaceId,
} from "@/lib/data";
import { venuePlaceById } from "@/lib/geo/venues";
import { ENGINE } from "@/lib/engine/config";
import { planMemberToRow, planToRow, rowToPlan, rowToPlanMember } from "@/lib/data/mappers";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPlanChanged } from "./realtime";

/** @typedef {import("@/types/domain").PlanT} PlanT */
/** @typedef {import("@/types/domain").PlanMemberT} PlanMemberT */
/** @typedef {import("@/types/api").PlanViewT} PlanViewT */

/** Thrown for expected failures; routes turn it into a JSON error with `status`. */
export class PlanError extends Error {
  /** @param {string} message @param {400 | 403 | 404 | 409 | 413 | 415 | 429 | 503} status */
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
  /** N4. @param {string} planId @param {"none" | "requested"} bookingStatus */
  async setBookingStatus(planId, bookingStatus) {
    const p = mem.plans.find((x) => x.id === planId);
    if (p) /** @type {any} */ (p).bookingStatus = bookingStatus;
  },
  /** G2: the Google Calendar event id for this member (null = removed). @param {string} planId @param {string} userId @param {string | null} eventId */
  async setMemberCalendar(planId, userId, eventId) {
    const m = mem.members.find((x) => x.planId === planId && x.userId === userId);
    if (m) /** @type {any} */ (m).googleEventId = eventId;
  },
};

// ---------------------------------------------------------------------------
// Store 2: Supabase (USE_MOCK_DATA=false)
// ---------------------------------------------------------------------------

const PLAN_COLS = "id, creator_id, place_id, start_at, end_at, status, created_at";
const MEMBER_COLS = "plan_id, user_id, rsvp";
const FK_VIOLATION = "23503";
const BAD_UUID = "22P02";
const NO_COLUMN = "42703";
/** G2: plan_members.google_event_id exists (migration 0007); turned off after one "no such column". */
let calendarColumn = true;

/**
 * N4: plans.booking_status comes from migration 0005. Until it's applied, read without it (every
 * plan is "none") instead of failing every plan request. After a "missing" answer we skip the column
 * for RECHECK_MS, then try it again, so a running server picks up the migration without a restart.
 */
const RECHECK_MS = 60_000;
let bookingColumnMissingAt = 0;
/**
 * Runs a plans select with booking_status when the column exists, and attaches bookingStatus.
 * @param {(cols: string) => PromiseLike<{ data: any, error: any }>} run
 */
async function selectPlans(run) {
  if (Date.now() - bookingColumnMissingAt >= RECHECK_MS) {
    const res = await run(`${PLAN_COLS}, booking_status`);
    if (res.error?.code !== NO_COLUMN) return res;
    console.warn("[plans] plans.booking_status missing: run supabase/migrations/0005_plan_booking.sql");
    bookingColumnMissingAt = Date.now();
  }
  return run(PLAN_COLS);
}
/** @param {any} row */
const rowWithBooking = (row) => ({ ...rowToPlan(row), bookingStatus: row.booking_status === "requested" ? "requested" : "none" });

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
    const { data, error } = await selectPlans((cols) => db().from("plans").select(cols).eq("id", id).maybeSingle());
    if (error?.code === BAD_UUID) return null; // not a valid id → "not found"
    failIf("plans.select", error);
    return data ? rowWithBooking(data) : null;
  },
  /** @param {string[]} planIds @returns {Promise<PlanMemberT[]>} */
  async membersOf(planIds) {
    if (planIds.length === 0) return [];
    // G2: google_event_id comes from Adel's migration 0007. Until it's applied, read without it.
    const run = (/** @type {string} */ cols) => db().from("plan_members").select(cols).in("plan_id", planIds);
    let res = calendarColumn ? await run(`${MEMBER_COLS}, google_event_id`) : await run(MEMBER_COLS);
    if (calendarColumn && res.error?.code === NO_COLUMN) {
      console.warn("[plans] plan_members.google_event_id missing: run Adel's migration 0007");
      calendarColumn = false;
      res = await run(MEMBER_COLS);
    }
    failIf("plan_members.select", res.error);
    return (res.data ?? []).map((/** @type {any} */ row) => ({ ...rowToPlanMember(row), googleEventId: row.google_event_id ?? null }));
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
    const { data, error } = await selectPlans((cols) => db().from("plans").select(cols).in("id", ids).order("start_at"));
    failIf("plans.select", error);
    return (data ?? []).map(rowWithBooking);
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
  /** N4. @param {string} planId @param {"none" | "requested"} bookingStatus */
  async setBookingStatus(planId, bookingStatus) {
    const { error } = await db().from("plans").update({ booking_status: bookingStatus }).eq("id", planId);
    if (error?.code === NO_COLUMN) throw new PlanError("Booking isn't set up on the server yet (migration 0005).", 503);
    failIf("plans.update booking", error);
  },
  /** G2. @param {string} planId @param {string} userId @param {string | null} eventId */
  async setMemberCalendar(planId, userId, eventId) {
    const { error } = await db().from("plan_members").update({ google_event_id: eventId }).eq("plan_id", planId).eq("user_id", userId);
    if (error?.code === NO_COLUMN) return console.warn("[plans] can't save google_event_id: run Adel's migration 0007");
    failIf("plan_members.update calendar", error);
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

/**
 * @param {PlanT} plan @param {PlanMemberT[]} members
 * @param {{ place: (id: string) => ReturnType<typeof getPlace>, users: Awaited<ReturnType<typeof getUsers>> }} [shared]
 *   listPlans: places and users loaded once for all the plans (same data, fewer queries).
 * @returns {Promise<PlanViewT>}
 */
async function toView(plan, members, shared) {
  const place = await (shared ? shared.place(plan.placeId) : getPlace(plan.placeId));
  if (!place) throw new PlanError("Place not found", 404);
  const users = shared ? shared.users : await getUsers(members.map((m) => m.userId));
  return {
    ...plan,
    bookingStatus: /** @type {any} */ (plan).bookingStatus ?? "none", // N4
    place: {
      id: place.id, name: place.name, category: place.category, photoUrl: place.photoUrl, address: place.address,
      ...(place.hoursVerified === false ? { hoursVerified: false } : {}), // N1: registry → "call ahead"
      // Events: exact start ("Starts 7:30 PM" on the plan screen; the plan's own times snap to 30 min).
      ...(/** @type {any} */ (place).startsAt ? { startsAt: /** @type {any} */ (place).startsAt } : {}),
    },
    members: members.map((m) => {
      const u = users.find((x) => x.id === m.userId);
      return {
        userId: m.userId,
        name: u?.name ?? "Unknown",
        avatarUrl: u?.avatarUrl ?? "",
        rsvp: m.rsvp,
        isCreator: m.userId === plan.creatorId,
        // G2: "Added to your Google Calendar ✓" on the plan screen.
        calendarAdded: Boolean(/** @type {any} */ (m).googleEventId),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// G2b: Google Calendar on "I'm in" / "Can't make it" / cancel. Never blocks or fails an RSVP.
// ---------------------------------------------------------------------------

/** Background tasks started outside a request (tests): kept so tests can wait for them. */
const pending = new Set();

/**
 * Run after the response (Next's after(), Vercel keeps it alive). Outside a request it just runs.
 * Never throws: a calendar problem must not break an RSVP.
 * @param {() => Promise<unknown>} task
 */
function inBackground(task) {
  const run = () => task().catch((e) => console.warn("[plans] calendar sync skipped:", e instanceof Error ? e.message : e));
  try {
    after(run);
  } catch {
    const p = run().finally(() => pending.delete(p));
    pending.add(p);
  }
}

/** Tests: wait for background calendar work started outside a request. */
export async function flushBackgroundForTests() {
  await Promise.all([...pending]);
}

/**
 * Adel's getGoogleRefreshToken (migration 0007). Until it exists, nobody is connected (= skipped).
 * Looked up by name so the build passes before it's merged.
 */
function calendarDeps() {
  let getRefreshToken;
  try {
    getRefreshToken = /** @type {any} */ (dataLayer).getGoogleRefreshToken;
  } catch {
    getRefreshToken = undefined; // strict test mocks throw on unknown exports
  }
  return { getRefreshToken: typeof getRefreshToken === "function" ? getRefreshToken : async () => null };
}

/**
 * Add the plan to `addIds`' calendars (if not already), remove it for `remove`. Users who never
 * connected Google are skipped by Anthony's helpers (they return null). One failure doesn't stop the others.
 * @param {PlanViewT} view
 * @param {PlanMemberT[]} members
 * @param {string[]} addIds
 * @param {PlanMemberT[]} remove  members whose event must go (they have a googleEventId)
 */
async function syncCalendars(view, members, addIds, remove) {
  const deps = calendarDeps();
  let changed = false;
  for (const userId of new Set(addIds)) {
    const m = members.find((x) => x.userId === userId);
    if (!m || /** @type {any} */ (m).googleEventId) continue;
    try {
      const eventId = await addPlanToCalendar(userId, view, deps);
      if (eventId) {
        await store().setMemberCalendar(view.id, userId, eventId);
        changed = true;
      }
    } catch (e) {
      console.warn(`[plans] calendar add skipped for ${userId}:`, e instanceof Error ? e.message : e);
    }
  }
  for (const m of remove) {
    try {
      await removePlanFromCalendar(m.userId, /** @type {any} */ (m).googleEventId, deps);
      await store().setMemberCalendar(view.id, m.userId, null);
      changed = true;
    } catch (e) {
      console.warn(`[plans] calendar remove skipped for ${m.userId}:`, e instanceof Error ? e.message : e);
    }
  }
  if (changed) await notify(view.id, members); // plan screens refetch → "Added to your Google Calendar ✓"
}

/**
 * Refuse invitees who are busy during the plan: their calendar, plus Anthony's buffer
 * (ENGINE.bufferMin) once it exists. Catches stale feeds, e.g. a friend who got busy after it loaded.
 * @param {string[]} inviteeIds @param {string} start @param {string} end
 */
async function assertInviteesFree(inviteeIds, start, end) {
  if (inviteeIds.length === 0) return;
  const pad = (/** @type {{ bufferMin?: number }} */ (ENGINE).bufferMin ?? 0) * 60_000;
  const from = Date.parse(start) - pad;
  const to = Date.parse(end) + pad;
  const blocks = await getBusyBlocks(inviteeIds, { start: new Date(from).toISOString(), end: new Date(to).toISOString() });
  const busyIds = [
    ...new Set(blocks.filter((b) => Date.parse(b.startAt) < to && Date.parse(b.endAt) > from).map((b) => b.userId)),
  ];
  if (busyIds.length === 0) return;
  const names = (await getUsers(busyIds)).map((u) => u.name.split(" ")[0]);
  throw new PlanError(`${names.join(" and ")} ${names.length === 1 ? "isn't" : "aren't"} free then`, 409);
}

/**
 * A plan at a search-only place needs a real `places` row first (plans.place_id is a foreign key):
 * - OpenStreetMap venue (search, lib/geo/venues.js): built HERE from our venue list by id, then saved by
 *   Adel's ensurePlaceFromVenue. Unknown venue id → 400.
 * - City event: Adel's eventPlaceById rebuilds it from the events table, ensurePlaceFromEvent saves it.
 * - Registry restaurant (N1): Adel's ensurePlaceFromRegistry rebuilds it from the registry by id.
 * Never from client data. Curated place → no-op. Unknown id → 400. Database down → 503 (no phantom place).
 * @param {string} placeId
 */
async function ensureRealPlace(placeId) {
  try {
    if (isVenuePlaceId(placeId)) await ensurePlaceFromVenue(venuePlaceById(placeId));
    else if (isEventPlaceId(placeId)) await ensurePlaceFromEvent(await eventPlaceById(placeId));
    else await ensurePlaceFromRegistry(placeId);
  } catch (e) {
    if (e instanceof DataInputError) throw new PlanError(e.message, 400);
    console.error("[plans] saving the place failed:", e instanceof Error ? e.message : e);
    throw new PlanError("Couldn't save the plan. Try again.", 503);
  }
}

/**
 * @param {string} creatorId
 * @param {import("@/types/api").CreatePlanRequestT} input
 * @returns {Promise<PlanViewT>}
 */
export async function createPlan(creatorId, input) {
  if (Date.parse(input.end) <= Date.parse(input.start)) throw new PlanError("end must be after start", 400);
  await ensureRealPlace(input.placeId);
  if (!(await getPlace(input.placeId))) throw new PlanError("Unknown place", 400);
  const inviteeIds = [...new Set(input.inviteeIds)].filter((id) => id !== creatorId);
  await assertInviteesFree(inviteeIds, input.start, input.end);
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
  for (const id of inviteeIds) members.push({ planId: plan.id, userId: id, rsvp: "invited" });
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
  // One users query for every plan, each place looked up once (was 2 queries per plan: QA found 29 for 13 plans).
  /** @type {Map<string, ReturnType<typeof getPlace>>} */
  const places = new Map();
  const shared = {
    users: await getUsers([...new Set(members.map((m) => m.userId))]),
    place: (/** @type {string} */ id) => places.get(id) ?? places.set(id, getPlace(id)).get(id),
  };
  return Promise.all(plans.map((p) => toView(p, members.filter((m) => m.planId === p.id), /** @type {any} */ (shared))));
}

/**
 * Loads a plan and checks the user is in it. Also used by photos.js / locations.js (G4 / G5).
 * @param {string} userId @param {string} planId
 * @returns {Promise<{ plan: PlanT, members: PlanMemberT[] }>}
 */
export async function loadPlanForMember(userId, planId) {
  return loadForMember(userId, planId);
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
  if (plan.status === "cancelled") throw new PlanError("This plan was cancelled", 409);
  await store().setMemberRsvp(planId, userId, rsvp);
  const updated = members.map((m) => (m.userId === userId ? { ...m, rsvp } : m));
  const status = computeStatus(plan.creatorId, updated);
  if (status !== plan.status) await store().setPlanStatus(planId, status);
  await notify(planId, updated);
  const view = await toView({ ...plan, status }, updated);

  // G2b: "in" → my calendar (and the organizer's when the plan just got confirmed); "out" → removed.
  const addIds = rsvp === "in" ? [userId] : [];
  if (status === "confirmed" && plan.status !== "confirmed") addIds.push(plan.creatorId);
  const remove = rsvp === "out" ? updated.filter((m) => m.userId === userId && /** @type {any} */ (m).googleEventId) : [];
  if (addIds.length > 0 || remove.length > 0) inBackground(() => syncCalendars(view, updated, addIds, remove));
  return view;
}

/**
 * The organizer calls the plan off (Oscar's "Cancel plan"). Final: it stays cancelled whatever the
 * RSVPs, and setRsvp then answers 409. Already cancelled → returns the plan (idempotent, no new ping).
 * Members' banners and plan screens update live (S2 signal).
 * @param {string} userId @param {string} planId @returns {Promise<PlanViewT>}
 */
export async function cancelPlan(userId, planId) {
  const { plan, members } = await loadForMember(userId, planId); // 404 missing, 403 not a member
  if (plan.creatorId !== userId) throw new PlanError("Only the organizer can cancel", 403);
  if (plan.status !== "cancelled") {
    await store().setPlanStatus(planId, "cancelled");
    await notify(planId, members);
  }
  const view = await toView({ ...plan, status: "cancelled" }, members);
  // G2b: take it out of everyone's Google Calendar (in the background).
  const remove = members.filter((m) => /** @type {any} */ (m).googleEventId);
  if (remove.length > 0) inBackground(() => syncCalendars(view, members, [], remove));
  return view;
}

/**
 * N4 "Book it": the organizer marks the reservation as requested (they booked by phone / online
 * themselves; Sidequest never books for real). Confirmed plans only. Idempotent.
 * Every member's plan screen updates live ("Reservation requested by …").
 * @param {string} userId @param {string} planId @returns {Promise<PlanViewT>}
 */
export async function requestBooking(userId, planId) {
  const { plan, members } = await loadForMember(userId, planId); // 404 missing, 403 not a member
  if (plan.creatorId !== userId) throw new PlanError("Only the organizer can book", 403);
  if (plan.status !== "confirmed") throw new PlanError("Book once someone said they're in", 409);
  if (/** @type {any} */ (plan).bookingStatus !== "requested") {
    await store().setBookingStatus(planId, "requested");
    await notify(planId, members);
  }
  return toView({ ...plan, bookingStatus: "requested" }, members);
}
