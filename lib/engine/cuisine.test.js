/** N1 engine part: cuisine filter, registry places with estimated travel, hoursVerified passthrough. */
import { describe, expect, it, vi } from "vitest";
import { FeedCard } from "@/types/feed";
import { makeCtx } from "./fixtures";
import { buildFeed } from "./index";
import { withExtraPlaces } from "./context";

const searchRegistry = vi.fn();
vi.mock("@/lib/data", async (orig) => ({ ...(await orig()), searchRegistry: (...a) => searchRegistry(...a) }));
const { addCuisinePlaces } = await import("./load");

const ctx = makeCtx();
const restaurant = ctx.places.find((p) => p.category === "restaurant");
const ALL_DAY = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ open: "11:30", close: "22:00" }]]));
/** A registry restaurant a few blocks from the fixture restaurant (no travel rows). */
const registry = {
  ...restaurant,
  id: "20000000-0000-4000-8000-000000000042",
  name: "Palais Tandoori Test",
  tags: ["indian"],
  lat: restaurant.lat + 0.003,
  lng: restaurant.lng + 0.002,
  hours: ALL_DAY,
  priceLevel: 2,
  source: /** @type {const} */ ("registry"),
  hoursVerified: false,
};
/** One curated restaurant tagged "indian" too (Adel tags curated places with their cuisine). */
const curatedIndianCtx = { ...ctx, places: ctx.places.map((p) => (p.id === restaurant.id ? { ...p, tags: [...p.tags, "indian"] } : p)) };

describe("withExtraPlaces", () => {
  it("adds places with a straight-line estimate for every person, flagged isEstimate", () => {
    const next = withExtraPlaces(ctx, [registry]);
    expect(next.places).toHaveLength(ctx.places.length + 1);
    for (const u of [ctx.me, ...ctx.friends.map((f) => f.user)]) {
      const t = next.travel.get(`${u.id}:${registry.id}`);
      expect(t?.isEstimate).toBe(true);
      expect(t?.minutes).toBeGreaterThan(0);
    }
    expect(ctx.places).toHaveLength(next.places.length - 1); // input not mutated
    expect(ctx.travel.has(`${ctx.me.id}:${registry.id}`)).toBe(false);
  });

  it("never duplicates or overrides a place already in ctx", () => {
    const next = withExtraPlaces(ctx, [restaurant, registry, registry]);
    expect(next.places.filter((p) => p.id === restaurant.id)).toHaveLength(1);
    expect(next.places.filter((p) => p.id === registry.id)).toHaveLength(1);
    expect(next.travel.get(`${ctx.me.id}:${restaurant.id}`)).toBe(ctx.travel.get(`${ctx.me.id}:${restaurant.id}`));
    expect(withExtraPlaces(ctx, [])).toBe(ctx);
  });
});

describe("FeedFilters.cuisine", () => {
  it("keeps only places tagged with that cuisine (curated + registry)", () => {
    const { cards } = buildFeed(withExtraPlaces(curatedIndianCtx, [registry]), { filters: { cuisine: "indian" } });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.place.tags.includes("indian"))).toBe(true);
    expect(new Set(cards.map((c) => c.place.id))).toEqual(new Set([restaurant.id, registry.id]));
  });

  it("an unknown cuisine gives an empty feed, not a crash", () => {
    expect(buildFeed(ctx, { filters: { cuisine: "martian" } }).cards).toEqual([]);
  });

  it("registry cards: valid FeedCard, hoursVerified:false + source passed through, travel marked as estimate", () => {
    const { cards } = buildFeed(withExtraPlaces(ctx, [registry]), { filters: { cuisine: "indian" } });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      FeedCard.parse(c);
      expect(c.place.hoursVerified).toBe(false);
      expect(c.place.source).toBe("registry");
      expect(c.friends.every((f) => f.travelIsEstimate)).toBe(true);
    }
  });

  it("curated cards stay exactly as before (no new keys)", () => {
    for (const c of buildFeed(ctx).cards) {
      expect("hoursVerified" in c.place).toBe(false);
      expect("source" in c.place).toBe(false);
    }
  });

  it("registry places never show up in the normal feed unless a search adds them", () => {
    expect(buildFeed(ctx).cards.some((c) => c.place.id === registry.id)).toBe(false);
  });
});

describe("addCuisinePlaces (loader)", () => {
  it("searches near the user's home and adds the results", async () => {
    searchRegistry.mockResolvedValueOnce([registry]);
    const next = await addCuisinePlaces(ctx, "indian");
    expect(searchRegistry).toHaveBeenCalledWith({ cuisine: "indian", near: { lat: ctx.me.homeLat, lng: ctx.me.homeLng } });
    expect(next?.places.some((p) => p.id === registry.id)).toBe(true);
  });

  it("no cuisine → no search; registry error → curated only (never throws)", async () => {
    searchRegistry.mockClear();
    expect(await addCuisinePlaces(ctx, undefined)).toBe(ctx);
    expect(searchRegistry).not.toHaveBeenCalled();
    searchRegistry.mockRejectedValueOnce(new Error("Unknown cuisine: martian"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await addCuisinePlaces(ctx, "martian")).toBe(ctx);
    warn.mockRestore();
  });
});
