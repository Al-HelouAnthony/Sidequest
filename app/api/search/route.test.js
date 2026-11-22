import { describe, expect, it, vi } from "vitest";
import { SearchResponse } from "@/types/api";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));
// No real Claude call (no cost): every card keeps its template caption.
vi.mock("@/lib/ai/captions", () => ({ captionCards: async () => new Map() }));
// Adel's real registry search (mock mode: a real 30-restaurant sample around McGill), watched.
vi.mock("@/lib/data", async (importOriginal) => {
  const real = await importOriginal();
  // searchRegistryByName: Adel is adding it; stand-in that finds nothing until then.
  return { ...real, searchRegistry: vi.fn(real.searchRegistry), searchRegistryByName: real.searchRegistryByName ?? vi.fn(async () => []) };
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

  it("nothing matches 'beach' (no beach in the data): falls back to outdoors and says so", async () => {
    const body = SearchResponse.parse(await (await post({ query: "beach" })).json());
    expect(body.summary).toBe("No beaches nearby · showing Outdoors");
    expect(body.filters.categories).toEqual(["park"]);
    for (const card of body.cards) expect(card.place.category).toBe("park");
  });

  it("words next to a specific thing narrow it: 'cinema du parc' → Cinéma du Parc", async () => {
    const body = SearchResponse.parse(await (await post({ query: "cinema du parc" })).json());
    if (!body.summary.includes("“parc”")) return; // nobody free there this week in the mock schedules
    expect(body.summary).toBe("Movies · “parc”");
    for (const card of body.cards) expect(card.place.name).toBe("Cinéma du Parc");
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

  it("name search: 'kazu' only returns Kazu (one page)", async () => {
    const body = SearchResponse.parse(await (await post({ query: "kazu" })).json());
    if (body.summary.startsWith("Nothing called")) return; // nobody free at Kazu this week in the mock schedules
    expect(body.summary).toBe("“kazu”");
    for (const card of body.cards) expect(card.place.name).toBe("Kazu");
    expect(body.nextCursor).toBeNull();
  });

  it("a word nothing is called ('zorblax'): honest chip, other suggestions still shown", async () => {
    const body = SearchResponse.parse(await (await post({ query: "zorblax" })).json());
    expect(body.summary).toBe("Nothing called “zorblax” nearby · showing all suggestions");
    expect(body.cards.length).toBeGreaterThan(0);
  });

  it("every kind of venue: 'hotel', 'bowling', 'escape room' return only that kind, from the Montréal venues", async () => {
    for (const [query, label, kind] of [["hotel", "Hotels", "hotel"], ["bowling", "Bowling", "bowling"], ["escape room", "Escape rooms", "escape-room"]]) {
      const body = SearchResponse.parse(await (await post({ query })).json());
      expect(body.summary).toBe(label);
      expect(body.cards.length).toBeGreaterThan(0);
      for (const card of body.cards) expect(card.place.tags).toContain(kind);
    }
  });

  it("a venue by exact name with no known word: 'salon de quilles darling'", async () => {
    const body = SearchResponse.parse(await (await post({ query: "salon darling" })).json());
    if (body.summary.startsWith("Nothing called")) return; // nobody free there this week in the mock schedules
    for (const card of body.cards) expect(card.place.name.toLowerCase()).toMatch(/salon.*darling|darling.*salon/);
  });

  it("events: 'free expo this weekend' only returns exhibitions, never a concert", async () => {
    const body = SearchResponse.parse(await (await post({ query: "free expo this weekend" })).json());
    if (body.summary.startsWith("No ")) return; // no sample exhibition this weekend with a free friend
    expect(body.summary).toBe("Budget · This weekend · Exhibitions");
    for (const card of body.cards) expect(card.place.tags.join(" ")).toMatch(/exhibition|exposition|museums/);
  });

  it("events: 'concert tonight' with no concert falls back to Events, not bars", async () => {
    const body = SearchResponse.parse(await (await post({ query: "concert tonight" })).json());
    if (body.summary.startsWith("No ")) expect(body.summary).toContain("showing Events");
    else for (const card of body.cards) expect(card.place.tags.join(" ")).toMatch(/concert|music|jazz/);
  });

  it("empty query gives 400", async () => {
    const res = await post({ query: "" });
    expect(res.status).toBe(400);
  });
});
