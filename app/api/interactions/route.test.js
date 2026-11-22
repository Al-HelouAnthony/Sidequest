/** POST /api/interactions, incl. swiping search-only places (registry restaurant, OSM venue) with no places row yet. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SAM = "00000000-0000-4000-8000-000000000001";
const CURATED = "10000000-0000-4000-8000-000000000001";
const REGISTRY = "20000000-0000-4000-8000-000000000042";
const UNKNOWN = "30000000-0000-4000-8000-000000000000";
const VENUE = "40000000-0000-4000-8000-103152678294"; // "Biodôme de Montréal" in lib/geo/venues.json
const BAD_VENUE = "40000000-0000-4000-8000-999999999999";
const EVENT = "50000000-0000-4000-8000-00000000abcd";
const place = (id, tags, category = "restaurant") => ({ id, tags, category });

const fns = {
  getPlace: vi.fn(async (id) => (id === CURATED ? place(CURATED, ["coffee"], "cafe") : null)),
  ensurePlaceFromRegistry: vi.fn(async (id) => {
    if (id === REGISTRY) return place(REGISTRY, ["indian"]);
    if (id === UNKNOWN) return null;
    throw new Error("not a registry restaurant");
  }),
  ensurePlaceFromVenue: vi.fn(async (p) => {
    if (!p) throw new Error("Unknown venue");
    return { ...p, hoursVerified: false };
  }),
  eventPlaceById: vi.fn(async (id) => (id === EVENT ? { id, tags: ["live-music"], category: "event", source: "event" } : null)),
  ensurePlaceFromEvent: vi.fn(async (p) => {
    if (!p) throw new Error("Unknown event");
    return p;
  }),
  recordInteraction: vi.fn(async () => {}),
  getTagWeights: vi.fn(async () => ({})),
  setTagWeights: vi.fn(async () => {}),
};
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));
vi.mock("@/lib/data", () => ({
  getPlace: (...a) => fns.getPlace(...a),
  ensurePlaceFromRegistry: (...a) => fns.ensurePlaceFromRegistry(...a),
  ensurePlaceFromVenue: (...a) => fns.ensurePlaceFromVenue(...a),
  isVenuePlaceId: (id) => /^40000000-0000-4000-8000-\d{12}$/.test(id),
  isEventPlaceId: (id) => /^50000000-0000-4000-8000-[0-9a-f]{12}$/.test(id),
  eventPlaceById: (...a) => fns.eventPlaceById(...a),
  ensurePlaceFromEvent: (...a) => fns.ensurePlaceFromEvent(...a),
  recordInteraction: (...a) => fns.recordInteraction(...a),
  getTagWeights: (...a) => fns.getTagWeights(...a),
  setTagWeights: (...a) => fns.setTagWeights(...a),
}));

const { POST } = await import("./route");
const post = (placeId, action = "save") =>
  POST(new Request("http://localhost/api/interactions", { method: "POST", body: JSON.stringify({ placeId, slotStart: "2026-11-22T18:00:00.000Z", action }) }));

describe("POST /api/interactions", () => {
  beforeEach(() => Object.values(fns).forEach((f) => f.mockClear()));

  it("curated place: records + learns, no registry lookup", async () => {
    expect((await post(CURATED)).status).toBe(200);
    expect(fns.ensurePlaceFromRegistry).not.toHaveBeenCalled();
    expect(fns.recordInteraction).toHaveBeenCalledOnce();
  });

  it("registry restaurant: saved via ensurePlaceFromRegistry first, then learns its cuisine tag", async () => {
    expect((await post(REGISTRY, "go")).status).toBe(200);
    expect(fns.ensurePlaceFromRegistry).toHaveBeenCalledWith(REGISTRY);
    const learned = fns.setTagWeights.mock.calls[0][1];
    expect(learned.indian).toBeGreaterThan(0);
  });

  it("unknown id, or the registry refuses it → 404 and nothing recorded", async () => {
    expect((await post(UNKNOWN)).status).toBe(404);
    expect((await post("40000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect(fns.recordInteraction).not.toHaveBeenCalled();
  });

  it("OSM venue from search: saved from the server's venue list (not the request), then learns its tags", async () => {
    expect((await post(VENUE, "save")).status).toBe(200);
    expect(fns.ensurePlaceFromRegistry).not.toHaveBeenCalled();
    expect(fns.ensurePlaceFromVenue.mock.calls[0][0]).toMatchObject({ id: VENUE, name: "Biodôme de Montréal" });
    expect(Object.keys(fns.setTagWeights.mock.calls[0][1])).toContain("animals");
  });

  it("unknown venue id → 404, nothing recorded", async () => {
    expect((await post(BAD_VENUE)).status).toBe(404);
    expect(fns.recordInteraction).not.toHaveBeenCalled();
  });

  it("city event card: ALWAYS saved first (getPlace finds events before they have a places row)", async () => {
    fns.getPlace.mockImplementationOnce(async (id) => (id === EVENT ? { id, tags: ["live-music"], category: "event" } : null));
    expect((await post(EVENT, "save")).status).toBe(200);
    expect(fns.ensurePlaceFromEvent).toHaveBeenCalledOnce();
    expect(fns.eventPlaceById).toHaveBeenCalledWith(EVENT);
    expect(fns.ensurePlaceFromRegistry).not.toHaveBeenCalled();
    expect(Object.keys(fns.setTagWeights.mock.calls[0][1])).toContain("live-music");
  });

  it("concurrent swipes by one user: every weight change is kept (no lost update)", async () => {
    // A slow store with read → change → write, like Supabase: overlapping requests used to keep only one.
    fns.getPlace.mockReset().mockImplementation(async (id) => (id === CURATED ? place(CURATED, ["coffee"], "cafe") : null));
    let stored = {};
    const tick = () => new Promise((r) => setTimeout(r, 5));
    fns.getTagWeights.mockImplementation(async () => {
      await tick();
      return { ...stored };
    });
    fns.setTagWeights.mockImplementation(async (_u, w) => {
      await tick();
      stored = w;
    });
    try {
      const res = await Promise.all([1, 2, 3, 4].map(() => post(CURATED, "skip")));
      expect(res.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(stored["cat:cafe"]).toBe(-1); // 4 × -0.25
      expect(stored.coffee).toBe(-1);
    } finally {
      fns.getTagWeights.mockImplementation(async () => ({}));
      fns.setTagWeights.mockImplementation(async () => {});
    }
  });
});
