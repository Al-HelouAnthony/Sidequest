// listPlans loads users once and each place once for all plans (QA: was 2 queries per plan).
import { describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ users: 0, places: 0 }));
vi.mock("@/lib/data", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getBusyBlocks: async () => [],
    getUsers: async (...a) => {
      spy.users++;
      return real.getUsers(...a);
    },
    getPlace: async (...a) => {
      spy.places++;
      return real.getPlace(...a);
    },
  };
});

const { createPlan, listPlans } = await import("./plans-store");
const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const KARIM = "00000000-0000-4000-8000-000000000003";
const CAFE = "10000000-0000-4000-8000-000000000001";
const PARK = "10000000-0000-4000-8000-000000000004";
const at = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

describe("listPlans batching", () => {
  it("3 plans at 2 places → 1 users lookup, 2 place lookups; same views as one-by-one", async () => {
    await createPlan(SAM, { placeId: CAFE, start: at(30), end: at(31), inviteeIds: [MAYA] });
    await createPlan(SAM, { placeId: CAFE, start: at(50), end: at(51), inviteeIds: [KARIM] });
    await createPlan(SAM, { placeId: PARK, start: at(70), end: at(71), inviteeIds: [MAYA, KARIM] });
    spy.users = 0;
    spy.places = 0;
    const plans = await listPlans(SAM);
    expect(plans).toHaveLength(3);
    expect(spy.users).toBe(1);
    expect(spy.places).toBe(2);
    const third = plans.find((p) => p.place.id === PARK);
    expect(third?.members.map((m) => m.name).sort()).toEqual(["Karim", "Maya", "Sam"]);
  });
});
