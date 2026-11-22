// G2b: plans ↔ Google Calendar (memory mode). Google is faked: nothing leaves the machine.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const KARIM = "00000000-0000-4000-8000-000000000003";

// Fake Anthony's helpers: Sam + Maya connected Google, Karim never did (→ null = skipped).
const { cal } = vi.hoisted(() => ({
  cal: { add: vi.fn(), remove: vi.fn(), connected: new Set(), fail: false },
}));
vi.mock("@/lib/calendar/planEvents", () => ({
  addPlanToCalendar: (userId, plan) => cal.add(userId, plan),
  removePlanFromCalendar: (userId, eventId) => cal.remove(userId, eventId),
}));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));

const { cancelPlan, createPlan, flushBackgroundForTests, getPlan, setRsvp } = await import("./plans-store");

const T1 = "2026-11-21T19:00:00.000Z";
const request = (inviteeIds) => ({ placeId: mockPlaces[0].id, start: T1, end: "2026-11-21T20:00:00.000Z", inviteeIds });
const added = async (planId, userId) => (await getPlan(SAM, planId)).members.find((m) => m.userId === userId)?.calendarAdded;

beforeEach(() => {
  globalThis.__sqPlans.plans.length = 0;
  globalThis.__sqPlans.members.length = 0;
  cal.connected = new Set([SAM, MAYA]);
  cal.fail = false;
  cal.add.mockReset().mockImplementation(async (userId) => {
    if (cal.fail) throw new Error("Google timed out");
    return cal.connected.has(userId) ? `gcal-${userId.slice(-1)}` : null;
  });
  cal.remove.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("G2b: Google Calendar on RSVP", () => {
  it("Maya says 'in' → in her calendar, and the organizer's too (the plan just got confirmed)", async () => {
    const { id } = await createPlan(SAM, request([MAYA]));
    const view = await setRsvp(MAYA, id, "in");
    expect(view.status).toBe("confirmed"); // the RSVP itself answers right away
    await flushBackgroundForTests();
    expect(cal.add.mock.calls.map(([u]) => u).sort()).toEqual([SAM, MAYA].sort());
    expect(cal.add.mock.calls[0][1]).toMatchObject({ id, place: { name: mockPlaces[0].name } }); // the plan goes to Google
    expect(await added(id, MAYA)).toBe(true);
    expect(await added(id, SAM)).toBe(true);
  });

  it("'Can't make it' → removed from her calendar", async () => {
    const { id } = await createPlan(SAM, request([MAYA]));
    await setRsvp(MAYA, id, "in");
    await flushBackgroundForTests();
    await setRsvp(MAYA, id, "out");
    await flushBackgroundForTests();
    expect(cal.remove).toHaveBeenCalledWith(MAYA, "gcal-2");
    expect(await added(id, MAYA)).toBe(false);
  });

  it("cancel → removed from everyone's calendar", async () => {
    const { id } = await createPlan(SAM, request([MAYA]));
    await setRsvp(MAYA, id, "in");
    await flushBackgroundForTests();
    await cancelPlan(SAM, id);
    await flushBackgroundForTests();
    expect(cal.remove.mock.calls.map(([u]) => u).sort()).toEqual([SAM, MAYA].sort());
    expect(await added(id, SAM)).toBe(false);
  });

  it("someone who never connected Google is skipped (calendarAdded stays false)", async () => {
    const { id } = await createPlan(SAM, request([KARIM]));
    await setRsvp(KARIM, id, "in");
    await flushBackgroundForTests();
    expect(cal.add).toHaveBeenCalledWith(KARIM, expect.anything());
    expect(await added(id, KARIM)).toBe(false);
  });

  it("Google failing never breaks the RSVP", async () => {
    cal.fail = true;
    const { id } = await createPlan(SAM, request([MAYA]));
    const view = await setRsvp(MAYA, id, "in");
    await flushBackgroundForTests();
    expect(view.status).toBe("confirmed");
    expect(await added(id, MAYA)).toBe(false);
  });

  it("saying 'in' twice doesn't add a second event", async () => {
    const { id } = await createPlan(SAM, request([MAYA, KARIM]));
    await setRsvp(MAYA, id, "in");
    await flushBackgroundForTests();
    await setRsvp(MAYA, id, "in");
    await flushBackgroundForTests();
    expect(cal.add.mock.calls.filter(([u]) => u === MAYA)).toHaveLength(1);
  });
});
