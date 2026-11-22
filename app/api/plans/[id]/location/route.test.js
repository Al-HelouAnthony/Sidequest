// G5 routes end to end (memory mode), as Oscar's LiveLocation.jsx calls them.
import { describe, expect, it, vi } from "vitest";
import { PlanLocationsResponse } from "@/types/api";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const LEA = "00000000-0000-4000-8000-000000000005";
const { auth } = vi.hoisted(() => ({ auth: { id: "00000000-0000-4000-8000-000000000001" } }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => auth.id }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));

const { createPlan } = await import("@/lib/social/plans-store");
const { POST } = await import("./route");
const { GET } = await import("../locations/route");
const PLACE = mockPlaces[0];

/** A plan starting in 10 minutes (sharing window open). */
async function soonPlan() {
  const start = Date.now() + 10 * 60_000;
  const plan = await createPlan(SAM, { placeId: PLACE.id, start: new Date(start).toISOString(), end: new Date(start + 3600_000).toISOString(), inviteeIds: [MAYA] });
  return plan.id;
}
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const send = (id, body) =>
  POST(new Request(`http://localhost/api/plans/${id}/location`, { method: "POST", body: JSON.stringify(body) }), ctx(id));
const read = (id) => GET(new Request("http://localhost"), ctx(id));

describe("POST /location + GET /locations", () => {
  it("Maya at the place → { ok: true }; Sam sees 'arrived', no coordinates anywhere", async () => {
    auth.id = SAM;
    const id = await soonPlan();
    auth.id = MAYA;
    const res = await send(id, { lat: PLACE.lat, lng: PLACE.lng, accuracyM: 8 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    auth.id = SAM;
    const body = await (await read(id)).json();
    const { members } = PlanLocationsResponse.parse(body);
    expect(members.find((m) => m.userId === MAYA)?.status).toBe("arrived");
    expect(JSON.stringify(body)).not.toMatch(/"lat"|"lng"|accuracy/);
  });

  it("second update within 15 s → 429; bad body → 400; outsider → 403", async () => {
    auth.id = SAM;
    const id = await soonPlan();
    expect((await send(id, { lat: PLACE.lat, lng: PLACE.lng, accuracyM: 8 })).status).toBe(200);
    expect((await send(id, { lat: PLACE.lat, lng: PLACE.lng, accuracyM: 8 })).status).toBe(429);
    expect((await send(id, { lat: 999, lng: 0, accuracyM: 8 })).status).toBe(400);
    auth.id = LEA;
    expect((await send(id, { lat: PLACE.lat, lng: PLACE.lng, accuracyM: 8 })).status).toBe(403);
    expect((await read(id)).status).toBe(403);
  });
});
