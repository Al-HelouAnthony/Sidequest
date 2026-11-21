// In-memory store (USE_MOCK_DATA=true, the default in tests).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPlaces } from "@/lib/mocks/places";
import { cancelPlan, computeStatus, createPlan, getPlan, listPlans, setRsvp } from "./plans-store";

// Memory mode never sends live updates (phones just poll).
const { notifyPlanChanged } = vi.hoisted(() => ({ notifyPlanChanged: vi.fn() }));
vi.mock("./realtime", () => ({ notifyPlanChanged }));

// Fixed calendars, so results don't depend on today's date (mock schedules are relative to "now").
const { busy } = vi.hoisted(() => ({ busy: { blocks: [] } }));
vi.mock("@/lib/data", async (importOriginal) => ({
  ...(await importOriginal()),
  getBusyBlocks: async () => busy.blocks,
}));

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const KARIM = "00000000-0000-4000-8000-000000000003";
const LEA = "00000000-0000-4000-8000-000000000005";
const PLACE = mockPlaces[0].id;
const T1 = "2026-11-21T19:00:00.000Z";
const T2 = "2026-11-22T19:00:00.000Z";

/** A one-hour plan request starting at `start`. */
const request = (start, inviteeIds = [MAYA, KARIM], placeId = PLACE) => ({
  placeId,
  start,
  end: new Date(Date.parse(start) + 3600_000).toISOString(),
  inviteeIds,
});

beforeEach(() => {
  globalThis.__sqPlans.plans.length = 0;
  globalThis.__sqPlans.members.length = 0;
  busy.blocks = [];
});

/** A busy block for `userId` from `start` to `end` (ISO). */
const block = (userId, start, end) => ({ userId, startAt: start, endAt: end, source: "manual" });

describe("plans store (memory)", () => {
  it("creator is in, invitees are invited, plan is pending", async () => {
    const plan = await createPlan(SAM, request(T1));
    expect(plan.status).toBe("pending");
    expect(plan.members.find((m) => m.userId === SAM)).toMatchObject({ rsvp: "in", isCreator: true });
    expect(plan.members.find((m) => m.userId === MAYA)?.rsvp).toBe("invited");
  });

  it("ignores the creator and duplicates in the invite list", async () => {
    const plan = await createPlan(SAM, request(T1, [MAYA, MAYA, SAM]));
    expect(plan.members).toHaveLength(2);
  });

  it("one invitee saying 'in' confirms the plan for everyone", async () => {
    const { id } = await createPlan(SAM, request(T1));
    await setRsvp(MAYA, id, "in");
    expect((await getPlan(SAM, id)).status).toBe("confirmed");
  });

  it("every invitee saying 'out' cancels the plan", async () => {
    const { id } = await createPlan(SAM, request(T1));
    await setRsvp(MAYA, id, "out");
    expect((await getPlan(SAM, id)).status).toBe("pending");
    await setRsvp(KARIM, id, "out");
    expect((await getPlan(SAM, id)).status).toBe("cancelled");
  });

  it("a non-member gets 403, an unknown plan 404", async () => {
    const { id } = await createPlan(SAM, request(T1));
    await expect(getPlan(LEA, id)).rejects.toMatchObject({ status: 403 });
    await expect(setRsvp(LEA, id, "in")).rejects.toMatchObject({ status: 403 });
    await expect(getPlan(SAM, "99999999-0000-4000-8000-000000000999")).rejects.toMatchObject({ status: 404 });
  });

  it("unknown place or end before start gives 400", async () => {
    await expect(createPlan(SAM, request(T1, [MAYA], "99999999-0000-4000-8000-000000000999"))).rejects.toMatchObject({
      status: 400,
    });
    await expect(createPlan(SAM, { ...request(T1), end: T1 })).rejects.toMatchObject({ status: 400 });
  });

  it("lists my plans, upcoming first", async () => {
    await createPlan(SAM, request(T2));
    await createPlan(KARIM, request(T1, [MAYA]));
    const plans = await listPlans(MAYA);
    expect(plans.map((p) => p.startAt)).toEqual([T1, T2]);
    expect(await listPlans(LEA)).toEqual([]);
  });

  it("a busy invitee: 409 'Maya isn't free then', nothing saved", async () => {
    busy.blocks = [block(MAYA, "2026-11-21T19:30:00.000Z", "2026-11-21T21:00:00.000Z")]; // overlaps T1–T1+1h
    await expect(createPlan(SAM, request(T1))).rejects.toMatchObject({ status: 409, message: "Maya isn't free then" });
    expect(globalThis.__sqPlans.plans).toHaveLength(0);
  });

  it("two busy invitees are both named", async () => {
    busy.blocks = [
      block(MAYA, "2026-11-21T19:00:00.000Z", "2026-11-21T20:00:00.000Z"),
      block(KARIM, "2026-11-21T19:45:00.000Z", "2026-11-21T22:00:00.000Z"),
    ];
    await expect(createPlan(SAM, request(T1))).rejects.toMatchObject({ status: 409, message: "Maya and Karim aren't free then" });
  });

  it("busy time that doesn't overlap the plan is fine", async () => {
    busy.blocks = [block(MAYA, "2026-11-21T17:00:00.000Z", "2026-11-21T19:00:00.000Z")]; // ends exactly at T1
    expect((await createPlan(SAM, request(T1))).status).toBe("pending");
  });

  it("the organizer cancels → cancelled for everyone", async () => {
    const { id } = await createPlan(SAM, request(T1));
    expect((await cancelPlan(SAM, id)).status).toBe("cancelled");
    expect((await getPlan(MAYA, id)).status).toBe("cancelled");
  });

  it("only the organizer can cancel: invitee and outsider get 403", async () => {
    const { id } = await createPlan(SAM, request(T1));
    await expect(cancelPlan(MAYA, id)).rejects.toMatchObject({ status: 403, message: "Only the organizer can cancel" });
    await expect(cancelPlan(LEA, id)).rejects.toMatchObject({ status: 403 });
    await expect(cancelPlan(SAM, "99999999-0000-4000-8000-000000000999")).rejects.toMatchObject({ status: 404 });
  });

  it("cancelling twice is fine (idempotent)", async () => {
    const { id } = await createPlan(SAM, request(T1));
    await cancelPlan(SAM, id);
    expect((await cancelPlan(SAM, id)).status).toBe("cancelled");
  });

  it("a cancelled plan stays cancelled: an RSVP after it gets 409", async () => {
    const { id } = await createPlan(SAM, request(T1));
    await setRsvp(MAYA, id, "in"); // confirmed first
    await cancelPlan(SAM, id);
    await expect(setRsvp(KARIM, id, "in")).rejects.toMatchObject({ status: 409, message: "This plan was cancelled" });
    expect((await getPlan(SAM, id)).status).toBe("cancelled");
  });

  it("N1: a plan at a registry restaurant creates its place first, then the plan", async () => {
    const { registryIdFor } = await import("@/lib/data/registry");
    const placeId = registryIdFor(132422); // "CUISINE INDIENNE MASAKALI" in the real sample
    const plan = await createPlan(SAM, request(T1, [MAYA], placeId));
    expect(plan.placeId).toBe(placeId);
    expect(plan.place.name.toLowerCase()).toContain("masakali");
  });

  it("N1: an unknown registry restaurant gives 400", async () => {
    const { registryIdFor } = await import("@/lib/data/registry");
    await expect(createPlan(SAM, request(T1, [MAYA], registryIdFor(999999999)))).rejects.toMatchObject({ status: 400 });
  });

  it("memory mode sends no live updates", async () => {
    const { id } = await createPlan(SAM, request(T1));
    await setRsvp(MAYA, id, "in");
    expect(notifyPlanChanged).not.toHaveBeenCalled();
  });

  it("a plan with no invitees stays pending", () => {
    expect(computeStatus(SAM, [{ planId: "p", userId: SAM, rsvp: "in" }])).toBe("pending");
  });
});
