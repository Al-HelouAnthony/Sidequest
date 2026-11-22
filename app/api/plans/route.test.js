import { describe, expect, it, vi } from "vitest";
import { PlanResponse } from "@/types/api";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));
// Everyone free (the busy check has its own tests), no live pings in mock mode.
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));

const { getEvents } = await import("@/lib/data");
const { POST } = await import("./route");
const post = (body) => POST(new Request("http://localhost/api/plans", { method: "POST", body: JSON.stringify(body) }));

/** Adel's sample city events for the coming week (mock mode), near McGill. */
async function sampleEvents() {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 86400_000);
  return getEvents({ start: start.toISOString(), end: end.toISOString() }, { lat: 45.5048, lng: -73.5772 });
}

describe("POST /api/plans", () => {
  it("a plan at a city event → 201, the event is saved first, the plan shows its exact start", async () => {
    const events = await sampleEvents();
    expect(events.length).toBeGreaterThan(0);
    const ev = events.find((e) => e.startsAt) ?? events[0];
    const start = ev.startsAt ?? new Date(Date.now() + 86400_000).toISOString();
    const res = await post({ placeId: ev.id, start, end: new Date(Date.parse(start) + 2 * 3600_000).toISOString(), inviteeIds: [MAYA] });
    expect(res.status).toBe(201);
    const { plan } = PlanResponse.parse(await res.json());
    expect(plan.placeId).toBe(ev.id);
    expect(plan.place.name).toBe(ev.name);
    if (ev.startsAt) expect(plan.place.startsAt).toBe(ev.startsAt);
  });

  it("an event id that doesn't exist → 400", async () => {
    const start = new Date(Date.now() + 86400_000).toISOString();
    const res = await post({
      placeId: "50000000-0000-4000-8000-ffffffffffff",
      start,
      end: new Date(Date.parse(start) + 3600_000).toISOString(),
      inviteeIds: [MAYA],
    });
    expect(res.status).toBe(400);
  });
});
