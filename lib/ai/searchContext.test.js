import { describe, expect, it } from "vitest";
import { withExtraPlaces } from "./searchContext";
import { travelKey } from "@/lib/engine/context";

const me = { id: "me", homeLat: 45.5048, homeLng: -73.5772 }; // McGill
const friend = { id: "f1", homeLat: 45.5225, homeLng: -73.5878 }; // Plateau
const curated = { id: "c1", lat: 45.5, lng: -73.57 };
const ctx = { me, friends: [{ user: friend }], places: [curated], travel: new Map([[travelKey("me", "c1"), { minutes: 9 }]]) };
const registry = { id: "r1", lat: 45.5079, lng: -73.5701 };

describe("withExtraPlaces", () => {
  it("adds the places with straight-line travel estimates for me and every friend", () => {
    const next = withExtraPlaces(ctx, [registry]);
    expect(next.places.map((p) => p.id)).toEqual(["c1", "r1"]);
    for (const id of ["me", "f1"]) {
      const t = next.travel.get(travelKey(id, "r1"));
      expect(t).toMatchObject({ userId: id, placeId: "r1", isEstimate: true });
      expect(t.minutes).toBeGreaterThan(0);
      expect(t.minutes).toBeLessThan(35);
    }
  });

  it("keeps existing travel rows, doesn't add a place twice, and doesn't change the original", () => {
    const next = withExtraPlaces(ctx, [curated, registry]);
    expect(next.places).toHaveLength(2);
    expect(next.travel.get(travelKey("me", "c1"))).toEqual({ minutes: 9 });
    expect(ctx.places).toHaveLength(1);
    expect(ctx.travel.has(travelKey("me", "r1"))).toBe(false);
  });
});
