/**
 * Guards data/places.json (the real places dataset, seeded into Supabase). Owner: Adel.
 * Opening-hours rule (shared with lib/engine): missing weekday = closed;
 * close < open = closes after midnight.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Category, Place } from "@/types/domain";
import places from "@/data/places.json";

/** Shared tag vocabulary (PLAN.md §6.3). Onboarding interest chips use the same list. */
const TAG_VOCABULARY = [
  "coffee",
  "cheap-eats",
  "views",
  "outdoors",
  "bars",
  "live-music",
  "art",
  "museums",
  "markets",
  "brunch",
  "iconic",
  "free",
  "late-night",
  "cocktails",
  "nature",
];

/** Greater Montréal, generous box. Catches swapped lat/lng and typos. */
const BBOX = { minLat: 45.4, maxLat: 45.71, minLng: -73.98, maxLng: -73.47 };

/** Phase 2: the dataset is complete (60+ places, 8+ per category). */
const DATASET_COMPLETE = true;
const MIN_PLACES = 60;
const MIN_PER_CATEGORY = 8;
/** "event" has no stable recurring venues; team decision pending (see PLAN.md open questions). */
const CATEGORIES_WITH_MINIMUM = Category.options.filter((c) => c !== "event");

describe("data/places.json", () => {
  it("matches the Place contract", () => {
    expect(() => z.array(Place).parse(places)).not.toThrow();
  });

  it("has unique ids", () => {
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
  });

  it("has unique names", () => {
    const seen = new Set();
    const dupes = places.map((p) => p.name.trim().toLowerCase()).filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    expect(dupes).toEqual([]);
  });

  it("every place is inside Montréal", () => {
    const outside = places
      .filter((p) => p.lat < BBOX.minLat || p.lat > BBOX.maxLat || p.lng < BBOX.minLng || p.lng > BBOX.maxLng)
      .map((p) => p.name);
    expect(outside).toEqual([]);
  });

  it("only uses tags from the shared vocabulary", () => {
    const unknown = places.flatMap((p) => p.tags.filter((t) => !TAG_VOCABULARY.includes(t)).map((t) => `${p.name}: ${t}`));
    expect(unknown).toEqual([]);
  });

  it("every place has at least one tag", () => {
    expect(places.filter((p) => p.tags.length === 0).map((p) => p.name)).toEqual([]);
  });

  it("every place is open at least one day, and no interval opens and closes at the same time", () => {
    const problems = places.flatMap((p) => {
      const intervals = Object.values(p.hours).flat();
      if (intervals.length === 0) return [`${p.name}: never open`];
      return intervals.filter((i) => i.open === i.close).map((i) => `${p.name}: ${i.open}-${i.close}`);
    });
    expect(problems).toEqual([]);
  });
});

describe.skipIf(!DATASET_COMPLETE)("dataset is complete (Phase 2)", () => {
  it(`has at least ${MIN_PLACES} places`, () => {
    expect(places.length).toBeGreaterThanOrEqual(MIN_PLACES);
  });

  it(`has at least ${MIN_PER_CATEGORY} places per category`, () => {
    const short = CATEGORIES_WITH_MINIMUM.map((c) => [c, places.filter((p) => p.category === c).length])
      .filter(([, n]) => n < MIN_PER_CATEGORY)
      .map(([c, n]) => `${c}: ${n}`);
    expect(short).toEqual([]);
  });
});
