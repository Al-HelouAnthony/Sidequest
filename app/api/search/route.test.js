import { describe, expect, it, vi } from "vitest";
import { SearchResponse } from "@/types/api";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));
// No real Claude call (no cost): every card keeps its template caption.
vi.mock("@/lib/ai/captions", () => ({ captionCards: async () => new Map() }));
// Adel's real registry search (mock mode: a real 30-restaurant sample around McGill), watched.
vi.mock("@/lib/data", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, searchRegistry: vi.fn(real.searchRegistry) };
});
const { searchRegistry, getUser } = await import("@/lib/data");

const { POST } = await import("./route");
const post = (body) =>
  POST(new Request("http://localhost/api/search", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/search", () => {
  it("demo query returns a valid SearchResponse with the Budget filter", async () => {
    const res = await post({ query: "budget with Maya tomorrow night" });
    expect(res.status).toBe(200);
    const body = SearchResponse.parse(await res.json());
    expect(body.filters.priceMax).toBe(1);
    expect(body.summary).toContain("Budget");
    for (const card of body.cards) expect(card.place.priceLevel).toBeLessThanOrEqual(1);
  });

  it("specific search: 'museum' only returns museums", async () => {
    const body = SearchResponse.parse(await (await post({ query: "museum" })).json());
    expect(body.summary).toBe("Museums");
    expect(body.cards.length).toBeGreaterThan(0);
    for (const card of body.cards) {
      const hay = `${card.place.name} ${card.place.tags.join(" ")}`.toLowerCase();
      expect(hay).toMatch(/museum|musée|biodôme|planétarium|sciences|calli/);
    }
    expect(body.nextCursor).toBeNull();
  });

  it("nothing matches 'bowling': falls back to activities and says so", async () => {
    const body = SearchResponse.parse(await (await post({ query: "bowling" })).json());
    expect(body.summary).toBe("No bowling nearby · showing Activities");
    expect(body.filters.categories).toEqual(["activity"]);
    for (const card of body.cards) expect(card.place.category).toBe("activity");
  });

  it("cuisine (N1): searches the registry near my home and only returns that cuisine", async () => {
    const me = await getUser(SAM);
    const body = SearchResponse.parse(await (await post({ query: "indian food tonight" })).json());
    expect(searchRegistry).toHaveBeenLastCalledWith({ cuisine: "indian", near: { lat: me.homeLat, lng: me.homeLng } });
    if (body.summary.startsWith("No ")) {
      // Nobody free at an Indian place in the sample tonight: honest fallback to restaurants.
      for (const card of body.cards) expect(card.place.category).toBe("restaurant");
    } else {
      expect(body.summary).toContain("Indian");
      for (const card of body.cards) {
        const hay = `${card.place.name} ${card.place.tags.join(" ")}`.toLowerCase();
        expect(hay).toMatch(/indian|indien|tandoori|curry|masala/);
      }
    }
  });

  it("registry down: search still works with curated places", async () => {
    searchRegistry.mockRejectedValueOnce(new Error("Supabase down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post({ query: "pizza" });
    expect(res.status).toBe(200);
    SearchResponse.parse(await res.json());
  });

  it("load more: a plain search returns Anthony's 'pass:offset' cursor when there are more cards", async () => {
    const body = SearchResponse.parse(await (await post({ query: "this weekend" })).json());
    if (body.cards.length === 10) expect(body.nextCursor).toMatch(/^\d+:\d+$/);
    else expect(body.nextCursor === null || /^\d+:\d+$/.test(body.nextCursor)).toBe(true);
  });

  it("cuisine search keeps filters.cuisine so GET /api/feed can rebuild it for 'load more'", async () => {
    const body = SearchResponse.parse(await (await post({ query: "pizza" })).json());
    if (!body.summary.startsWith("No ")) expect(body.filters.cuisine).toBe("pizza");
    expect(body.nextCursor === null || /^\d+:\d+$/.test(body.nextCursor)).toBe(true);
  });

  it("empty query gives 400", async () => {
    const res = await post({ query: "" });
    expect(res.status).toBe(400);
  });
});
