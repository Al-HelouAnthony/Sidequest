import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanResponse } from "@/types/api";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const { auth } = vi.hoisted(() => ({ auth: { id: "00000000-0000-4000-8000-000000000001" } }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => auth.id }));
// Everyone free, no live pings (memory mode).
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));

const { createPlan } = await import("@/lib/social/plans-store");
const { POST } = await import("./route");
const cancel = (id) => POST(new Request(`http://localhost/api/plans/${id}/cancel`, { method: "POST" }), { params: Promise.resolve({ id }) });

let planId;
beforeEach(async () => {
  auth.id = SAM;
  const plan = await createPlan(SAM, {
    placeId: mockPlaces[0].id,
    start: "2026-11-21T19:00:00.000Z",
    end: "2026-11-21T20:00:00.000Z",
    inviteeIds: [MAYA],
  });
  planId = plan.id;
});

describe("POST /api/plans/[id]/cancel", () => {
  it("organizer, no body → 200 with the cancelled plan", async () => {
    const res = await cancel(planId);
    expect(res.status).toBe(200);
    expect(PlanResponse.parse(await res.json()).plan.status).toBe("cancelled");
  });

  it("already cancelled → still 200", async () => {
    await cancel(planId);
    expect((await cancel(planId)).status).toBe(200);
  });

  it("an invitee gets 403 (not 404)", async () => {
    auth.id = MAYA;
    expect((await cancel(planId)).status).toBe(403);
  });
});
