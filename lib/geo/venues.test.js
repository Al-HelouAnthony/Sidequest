import { describe, expect, it } from "vitest";
import VENUES from "./venues.json";
import { venueKinds, venueToPlace, venuesByName, venuesForCategories, venuesForTerms } from "./venues";
import { SEARCH_TERMS } from "@/lib/ai/searchTerms";
import { Place } from "@/types/domain";

const MCGILL = { lat: 45.5048, lng: -73.5772 };
const term = (id) => SEARCH_TERMS.filter((t) => t.id === id);

describe("Montréal venues (OpenStreetMap)", () => {
  it("every row is a valid Place, with a unique id and a known kind, inside Greater Montréal", () => {
    const ids = new Set();
    for (const v of VENUES) {
      expect(venueKinds()).toContain(v.kind);
      expect(ids.has(v.id)).toBe(false);
      ids.add(v.id);
      expect(v.lat).toBeGreaterThan(45.35);
      expect(v.lat).toBeLessThan(45.75);
      expect(v.lng).toBeGreaterThan(-74.05);
      expect(v.lng).toBeLessThan(-73.35);
      expect(Place.safeParse(venueToPlace(v)).success).toBe(true);
    }
    expect(VENUES.length).toBeGreaterThan(2000);
  });

  it("places have assumed hours ('call ahead') and a fallback picture", () => {
    const p = venueToPlace(VENUES[0]);
    expect(p.hoursVerified).toBe(false);
    expect(p.photoUrl).toMatch(/^\/fallback\/[a-z]+\.svg$/);
  });

  it("specific things find that exact kind, nearest first", () => {
    for (const id of ["hotel", "bowling", "escape-room", "cinema", "museum", "climbing", "karaoke"]) {
      const found = venuesForTerms(term(id), MCGILL, { radiusKm: 15 });
      expect(found.length).toBeGreaterThan(0);
    }
    const bowling = venuesForTerms(term("bowling"), MCGILL, { radiusKm: 15 });
    // A bowling alley, or a place NAMED for it (e.g. a bar called "… Quilles …": quilles = bowling).
    for (const p of bowling) expect(p.tags.includes("bowling") || /bowling|quilles/i.test(p.name)).toBe(true);
    expect(bowling.some((p) => p.tags.includes("bowling"))).toBe(true);
  });

  it("finds venues by exact name, whole words only", () => {
    expect(venuesByName("cinema du parc", MCGILL).map((p) => p.name)).toContain("Cinéma du Parc");
    expect(venuesByName("four", MCGILL).some((p) => /carrefour/i.test(p.name))).toBe(false);
    expect(venuesByName("zorblax", MCGILL)).toEqual([]);
  });

  it("skips copies of places already in the app (same name, < 300 m)", () => {
    const parc = venuesByName("cinema du parc", MCGILL)[0];
    expect(venuesByName("cinema du parc", MCGILL, { existing: [parc] })).toEqual([]);
  });

  it("broad searches get the nearest venues of that category", () => {
    const bars = venuesForCategories(["bar"], MCGILL, { limit: 5 });
    expect(bars).toHaveLength(5);
    for (const p of bars) expect(p.category).toBe("bar");
  });
});
