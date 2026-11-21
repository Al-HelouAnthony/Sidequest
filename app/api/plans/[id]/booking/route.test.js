/** N4: GET/POST /api/plans/[id]/booking on the real in-memory plans store (mock mode). */
import { describe, expect, it, vi } from "vitest";
import { BookingInfo, PlanResponse } from "@/types/api";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const KARIM = "00000000-0000-4000-8000-000000000003";
const who = vi.hoisted(() => ({ id: "00000000-0000-4000-8000-000000000001" }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => who.id }));
vi.mock("@/lib/social/realtime", () => ({ notifyPlanChanged: vi.fn() }));
vi.mock("@/lib/data", async (orig) => ({ ...(await orig()), getBusyBlocks: async () => [] }));

const { createPlan, setRsvp } = await import("@/lib/social/plans-store");
const { GET, POST } = await import("./route");
const schwartz = /** @type {any} */ (mockPlaces.find((p) => p.name === "Schwartz's Deli"));
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const req = (id, method) => new Request(`http://localhost/api/plans/${id}/booking`, { method });
const as = async (userId, fn) => {
  who.id = userId;
  return fn();
};

describe("/api/plans/[id]/booking", () => {
  it("full flow: pending → 409, invitee → 403, organizer → requested, everyone sees it", async () => {
    const plan = await createPlan(SAM, { placeId: schwartz.id, start: "2026-11-22T00:30:00.000Z", end: "2026-11-22T01:30:00.000Z", inviteeIds: [MAYA, KARIM] });

    expect((await as(SAM, () => POST(req(plan.id, "POST"), ctx(plan.id)))).status).toBe(409); // nobody's in yet
    await setRsvp(MAYA, plan.id, "in");
    expect((await as(MAYA, () => POST(req(plan.id, "POST"), ctx(plan.id)))).status).toBe(403); // not the organizer

    const info = BookingInfo.parse(await (await as(SAM, () => GET(req(plan.id, "GET"), ctx(plan.id)))).json());
    expect(info.partySize).toBe(2); // Sam + Maya (Karim still invited)
    expect(info.openDuring).toBe(true);
    expect(info.bookingStatus).toBe("none");

    const res = await as(SAM, () => POST(req(plan.id, "POST"), ctx(plan.id)));
    expect(res.status).toBe(200);
    expect(PlanResponse.parse(await res.json()).plan.bookingStatus).toBe("requested");
    expect((await as(SAM, () => POST(req(plan.id, "POST"), ctx(plan.id)))).status).toBe(200); // idempotent

    const seenByMaya = BookingInfo.parse(await (await as(MAYA, () => GET(req(plan.id, "GET"), ctx(plan.id)))).json());
    expect(seenByMaya.bookingStatus).toBe("requested");
  });

  it("strangers get 403, unknown plans 404", async () => {
    const plan = await createPlan(SAM, { placeId: schwartz.id, start: "2026-11-23T00:30:00.000Z", end: "2026-11-23T01:30:00.000Z", inviteeIds: [MAYA] });
    expect((await as(KARIM, () => GET(req(plan.id, "GET"), ctx(plan.id)))).status).toBe(403);
    expect((await as(SAM, () => GET(req("nope", "GET"), ctx("00000000-0000-4000-8000-00000000dead")))).status).toBe(404);
  });
});
