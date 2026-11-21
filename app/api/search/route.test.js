import { describe, expect, it, vi } from "vitest";
import { SearchResponse } from "@/types/api";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));
// No real Claude call (no cost): every card keeps its template caption.
vi.mock("@/lib/ai/captions", () => ({ captionCards: async () => new Map() }));

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

  it("empty query gives 400", async () => {
    const res = await post({ query: "" });
    expect(res.status).toBe(400);
  });
});
