/**
 * Part 11a: every FeedFilters field Mhammad's search can produce, alone and combined.
 * Demo query: "something cheap with Maya tomorrow night".
 * Fixture: now = Fri 2026-11-20 20:00 Montréal → "tomorrow" = Sat 21.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FeedCard, FeedFilters } from "@/types/feed";
import { toLocal } from "@/lib/time";
import { mockUsers } from "@/lib/mocks/users";
import { FIXED_NOW, makeCtx } from "./fixtures";
import { buildFeed } from "./index";

const [, maya, karim] = mockUsers;
const ctx = makeCtx();
const feed = (filters) => buildFeed(ctx, { filters }).cards;
const range = (start, end) => ({ start: start.toUTC().toISO(), end: end.toUTC().toISO() });
const tomorrow = FIXED_NOW.plus({ days: 1 }).startOf("day");
const tomorrowNight = range(tomorrow.set({ hour: 18 }), tomorrow.set({ hour: 23 }));

describe("each filter alone", () => {
  it("empty filters = no filters", () => {
    expect(feed({}).map((c) => c.id)).toEqual(feed(undefined).map((c) => c.id));
  });

  it("friendIds: every card includes ALL required friends", () => {
    const both = feed({ friendIds: [maya.id, karim.id] });
    expect(both.length).toBeGreaterThan(0);
    for (const c of both) {
      expect(c.friends.map((f) => f.id)).toEqual(expect.arrayContaining([maya.id, karim.id]));
    }
  });

  it("dateRange 'tomorrow night': every slot starts and ends inside 18:00–23:00 Sat", () => {
    const cards = feed({ dateRange: tomorrowNight });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(Date.parse(c.slot.start)).toBeGreaterThanOrEqual(Date.parse(tomorrowNight.start));
      expect(Date.parse(c.slot.end)).toBeLessThanOrEqual(Date.parse(tomorrowNight.end));
      expect(toLocal(c.slot.start).weekday).toBe(6);
    }
  });

  it("priceMax: nothing above it", () => {
    for (const max of [1, 2, 3]) {
      const cards = feed({ priceMax: max });
      expect(cards.every((c) => c.place.priceLevel <= max)).toBe(true);
    }
  });

  it("categories: only those categories (several allowed)", () => {
    const cards = feed({ categories: ["cafe", "viewpoint"] });
    expect(cards.length).toBeGreaterThan(0);
    expect(new Set(cards.map((c) => c.place.category))).toEqual(new Set(["cafe", "viewpoint"]));
  });

  it("indoorOnly: no outdoor places", () => {
    const outdoorIds = new Set(ctx.places.filter((p) => !p.indoor).map((p) => p.id));
    const cards = feed({ indoorOnly: true });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => outdoorIds.has(c.place.id))).toBe(false);
  });
});

describe("combined: 'something cheap with Maya tomorrow night'", () => {
  const filters = { priceMax: 1, friendIds: [maya.id], dateRange: tomorrowNight };

  it("is a valid FeedFilters object (what Mhammad's parser must output)", () => {
    expect(FeedFilters.parse(filters)).toEqual(filters);
  });

  it("every card satisfies all three filters and is a valid FeedCard", () => {
    const cards = feed(filters);
    expect(cards.length).toBeGreaterThan(0);
    expect(() => z.array(FeedCard).parse(cards)).not.toThrow();
    for (const c of cards) {
      expect(c.place.priceLevel).toBeLessThanOrEqual(1);
      expect(c.friends.some((f) => f.id === maya.id)).toBe(true);
      expect(Date.parse(c.slot.start)).toBeGreaterThanOrEqual(Date.parse(tomorrowNight.start));
      expect(Date.parse(c.slot.end)).toBeLessThanOrEqual(Date.parse(tomorrowNight.end));
    }
  });

  it("is a subset of the unfiltered feed's places", () => {
    const all = new Set(feed({}).map((c) => c.place.id));
    for (const c of feed(filters)) expect(all.has(c.place.id)).toBe(true);
  });
});

describe("edge cases: empty, never a crash", () => {
  it("a date range entirely in the past → []", () => {
    expect(feed({ dateRange: range(FIXED_NOW.minus({ days: 3 }), FIXED_NOW.minus({ days: 2 })) })).toEqual([]);
  });

  it("a range shorter than any visit (30 min) → []", () => {
    const t = tomorrow.set({ hour: 14 });
    expect(feed({ dateRange: range(t, t.plus({ minutes: 30 })) })).toEqual([]);
  });

  it("a range overlapping the lead time only keeps slots after now + lead", () => {
    const cards = feed({ dateRange: range(FIXED_NOW, FIXED_NOW.plus({ days: 1 })) });
    for (const c of cards) expect(Date.parse(c.slot.start)).toBeGreaterThanOrEqual(FIXED_NOW.plus({ minutes: 60 }).toMillis());
  });

  it("a friendId that isn't my friend → [] (never shows strangers)", () => {
    expect(feed({ friendIds: ["00000000-0000-4000-8000-0000000000ff"] })).toEqual([]);
  });

  it("filters that match nothing → []", () => {
    expect(feed({ categories: ["event"] })).toEqual([]);
    expect(feed({ categories: ["bar"], indoorOnly: true, priceMax: 1 })).toEqual([]);
  });

  it("debug reports filtered places", () => {
    const { debug } = buildFeed(ctx, { filters: { categories: ["cafe"] }, debug: true });
    expect(debug.dropped.filters).toBe(ctx.places.filter((p) => p.category !== "cafe").length);
  });
});
