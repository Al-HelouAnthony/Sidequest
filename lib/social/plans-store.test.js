// In-memory store (USE_MOCK_DATA=true, the default in tests).
import { beforeEach, describe, expect, it } from "vitest";
import { mockPlaces } from "@/lib/mocks/places";
import { computeStatus, createPlan, getPlan, listPlans, setRsvp } from "./plans-store";

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
});

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

  it("a plan with no invitees stays pending", () => {
    expect(computeStatus(SAM, [{ planId: "p", userId: SAM, rsvp: "in" }])).toBe("pending");
  });
});
