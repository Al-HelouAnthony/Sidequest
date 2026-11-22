// G5 live location (memory mode). Others only ever get a status + distance + ETA, never coordinates.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPlaces } from "@/lib/mocks/places";
import { PlanLocationsResponse } from "@/types/api";

vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));
const { cancelPlan, createPlan } = await import("./plans-store");
const { memberStatus, planLocations, shareLocation } = await import("./locations");

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const LEA = "00000000-0000-4000-8000-000000000005";
const PLACE = mockPlaces[0];
const START = Date.parse("2026-11-21T19:00:00.000Z");
const END = START + 2 * 3600_000;
const MIN = 60_000;
const AT_PLACE = { lat: PLACE.lat, lng: PLACE.lng, accuracyM: 10 };
const FAR = { lat: PLACE.lat + 0.03, lng: PLACE.lng, accuracyM: 20 }; // ~3.3 km north (~27 min)
const NEAR = { lat: PLACE.lat + 0.013, lng: PLACE.lng, accuracyM: 20 }; // ~1.4 km north (~15 min)

async function plan() {
  return createPlan(SAM, { placeId: PLACE.id, start: new Date(START).toISOString(), end: new Date(END).toISOString(), inviteeIds: [MAYA] });
}

beforeEach(() => {
  globalThis.__sqPlans.plans.length = 0;
  globalThis.__sqPlans.members.length = 0;
  globalThis.__sqLocations.clear();
});

describe("memberStatus (computed on the server)", () => {
  const fix = (pos, at) => ({ ...pos, updatedAt: new Date(at).toISOString() });

  it("no position or an old one → not-sharing", () => {
    expect(memberStatus(SAM, undefined, PLACE, START, START)).toEqual({ userId: SAM, status: "not-sharing" });
    expect(memberStatus(SAM, fix(FAR, START - 10 * MIN), PLACE, START, START)).toEqual({ userId: SAM, status: "not-sharing" });
  });

  it("at the place → arrived; far with time left → sharing + ETA; can't make it → late", () => {
    expect(memberStatus(SAM, fix(AT_PLACE, START), PLACE, START, START).status).toBe("arrived");
    const early = memberStatus(SAM, fix(FAR, START - 30 * MIN), PLACE, START, START - 30 * MIN);
    expect(early).toMatchObject({ status: "sharing" });
    expect(early.distanceM).toBeGreaterThan(3000);
    expect(early.etaMin).toBeGreaterThan(5);
    expect(memberStatus(SAM, fix(FAR, START), PLACE, START, START).status).toBe("late");
  });

  it("never returns coordinates", () => {
    for (const s of [memberStatus(SAM, fix(FAR, START), PLACE, START, START), memberStatus(SAM, fix(AT_PLACE, START), PLACE, START, START)]) {
      expect(Object.keys(s)).not.toContain("lat");
      expect(Object.keys(s)).not.toContain("lng");
      expect(Object.keys(s)).not.toContain("accuracyM");
    }
  });
});

describe("G5 share + read", () => {
  it("Maya shares on her way → Sam sees her ETA (no coordinates), valid for the contract", async () => {
    const { id } = await plan();
    await shareLocation(MAYA, id, NEAR, START - 20 * MIN); // ~15 min away, 20 min to go → on time
    const members = await planLocations(SAM, id, START - 20 * MIN + 5000);
    PlanLocationsResponse.parse({ members });
    expect(members.find((m) => m.userId === MAYA)).toMatchObject({ status: "sharing" });
    expect(members.find((m) => m.userId === MAYA)?.etaMin).toBeLessThan(20);
    expect(members.find((m) => m.userId === SAM)).toEqual({ userId: SAM, status: "not-sharing" });
    expect(JSON.stringify(members)).not.toMatch(/"lat"|"lng"/);
  });

  it("window: only from 30 min before to 30 min after the start (409 outside)", async () => {
    const { id } = await plan();
    await expect(shareLocation(MAYA, id, FAR, START - 31 * MIN)).rejects.toMatchObject({ status: 409 });
    await expect(shareLocation(MAYA, id, FAR, START + 31 * MIN)).rejects.toMatchObject({ status: 409 });
    await shareLocation(MAYA, id, AT_PLACE, START + 29 * MIN);
    expect((await planLocations(SAM, id, START + 29 * MIN)).find((m) => m.userId === MAYA)?.status).toBe("arrived");
    // Outside the window everyone shows as not-sharing.
    expect((await planLocations(SAM, id, START + 40 * MIN)).every((m) => m.status === "not-sharing")).toBe(true);
  });

  it("at most one update per 15 s (429)", async () => {
    const { id } = await plan();
    await shareLocation(MAYA, id, FAR, START - 10 * MIN);
    await expect(shareLocation(MAYA, id, FAR, START - 10 * MIN + 5000)).rejects.toMatchObject({ status: 429 });
    await shareLocation(MAYA, id, AT_PLACE, START - 10 * MIN + 16_000);
  });

  it("members only (403), and a cancelled plan shares nothing (409)", async () => {
    const { id } = await plan();
    await expect(shareLocation(LEA, id, FAR, START)).rejects.toMatchObject({ status: 403 });
    await expect(planLocations(LEA, id, START)).rejects.toMatchObject({ status: 403 });
    await cancelPlan(SAM, id);
    await expect(shareLocation(MAYA, id, FAR, START)).rejects.toMatchObject({ status: 409 });
  });

  it("positions are deleted once the plan is over", async () => {
    const { id } = await plan();
    await shareLocation(MAYA, id, FAR, START - 5 * MIN);
    expect(globalThis.__sqLocations.has(id)).toBe(true);
    await planLocations(SAM, id, END + MIN);
    expect(globalThis.__sqLocations.has(id)).toBe(false);
  });
});
