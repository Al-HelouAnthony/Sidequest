/** POST /api/plans/now on the real in-memory plans store; the picker and context are faked. */
import { describe, expect, it, vi } from "vitest";
import { PlanResponse } from "@/types/api";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const pick = vi.hoisted(() => ({ value: /** @type {any} */ (null) }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));
vi.mock("@/lib/social/realtime", () => ({ notifyPlanChanged: vi.fn() }));
vi.mock("@/lib/data", async (orig) => ({ ...(await orig()), getBusyBlocks: async () => [] }));
vi.mock("@/lib/engine/load", () => ({ loadContext: async () => ({ me: { id: SAM } }) }));
vi.mock("@/lib/engine/rightNow", async (orig) => ({ ...(await orig()), pickRightNow: () => pick.value }));

const { POST } = await import("./route");

describe("POST /api/plans/now", () => {
  it("creates a real plan ~10 min from now with the picked place and friends", async () => {
    pick.value = { place: mockPlaces[0], friendIds: [MAYA] };
    const before = Date.now();
    const res = await POST();
    expect(res.status).toBe(201);
    const { plan } = PlanResponse.parse(await res.json());
    expect(plan.placeId).toBe(mockPlaces[0].id);
    expect(plan.members.map((m) => m.userId).sort()).toEqual([SAM, MAYA].sort());
    const inMin = (Date.parse(plan.startAt) - before) / 60_000;
    expect(inMin).toBeGreaterThanOrEqual(10);
    expect(inMin).toBeLessThan(16);
    expect(Date.parse(plan.endAt) - Date.parse(plan.startAt)).toBe(3_600_000);
  });

  it("nobody free / nothing open → 409 with a clear message, no plan", async () => {
    pick.value = null;
    const res = await POST();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Nobody's free/);
  });
});
