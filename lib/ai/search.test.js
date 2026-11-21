import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/types/domain";
import { FeedFilters } from "@/types/feed";
import { parseSearch } from "./search";

const MAYA = "00000000-0000-4000-8000-000000000002";
const KARIM = "00000000-0000-4000-8000-000000000003";
const LEA = "00000000-0000-4000-8000-000000000005";
const friends = [
  { id: MAYA, name: "Maya" },
  { id: KARIM, name: "Karim" },
  { id: LEA, name: "Léa" },
];
/** Saturday 2026-11-21, Montréal time (UTC−5). */
const at = (hhmm) => DateTime.fromISO(`2026-11-21T${hhmm}`, { zone: TIMEZONE });
const search = (q, now = at("10:00")) => parseSearch(q, { now, friends });

describe("parseSearch", () => {
  it("demo query: budget with Maya tomorrow night", () => {
    const { filters, summary } = search("budget with Maya tomorrow night");
    expect(filters.priceMax).toBe(1);
    expect(filters.friendIds).toEqual([MAYA]);
    // Sunday 18:00–23:00 Montréal = 23:00Z → 04:00Z next day
    expect(filters.dateRange).toEqual({ start: "2026-11-22T23:00:00.000Z", end: "2026-11-23T04:00:00.000Z" });
    expect(summary).toBe("Budget · with Maya · Tomorrow night");
  });

  it("'cheap' works but the chip always says Budget", () => {
    const { filters, summary } = search("something cheap");
    expect(filters.priceMax).toBe(1);
    expect(summary).toBe("Budget");
  });

  it("mid-range words", () => {
    expect(search("somewhere reasonable").filters.priceMax).toBe(2);
    expect(search("not too expensive please").filters.priceMax).toBe(2);
  });

  it("'free' alone is about time, not price", () => {
    const { filters } = search("when is maya free");
    expect(filters.priceMax).toBeUndefined();
    expect(filters.friendIds).toEqual([MAYA]);
    expect(search("something for free").filters.priceMax).toBe(1);
  });

  it("categories from many words", () => {
    expect(search("coffee and brunch").filters.categories).toEqual(["cafe"]);
    expect(search("drinks then a concert").filters.categories).toEqual(["bar", "event"]);
    expect(search("grab a bite").filters.categories).toEqual(["restaurant"]);
  });

  it("'show me' is not an event; indoor words", () => {
    const { filters, summary } = search("show me something indoor");
    expect(filters.categories).toBeUndefined();
    expect(filters.indoorOnly).toBe(true);
    expect(summary).toBe("Indoors");
    expect(search("a comedy show").filters.categories).toEqual(["event"]);
  });

  it("friend names ignore accents and capitals", () => {
    expect(search("with lea").filters.friendIds).toEqual([LEA]);
    expect(search("with KARIM and Maya").filters.friendIds).toEqual([MAYA, KARIM]);
  });

  it("tonight keeps its full 18:00–23:00 range, even late (the engine trims the past)", () => {
    const tonight = { start: "2026-11-21T23:00:00.000Z", end: "2026-11-22T04:00:00.000Z" };
    expect(search("tonight").filters.dateRange).toEqual(tonight);
    expect(search("tonight", at("21:30")).filters.dateRange).toEqual(tonight);
    expect(search("tonight", at("23:30")).filters.dateRange).toEqual(tonight);
  });

  it("today is the whole day 09:00–23:00", () => {
    expect(search("today").filters.dateRange).toEqual({ start: "2026-11-21T14:00:00.000Z", end: "2026-11-22T04:00:00.000Z" });
  });

  it("every range is at least 2 hours", () => {
    for (const q of ["morning", "afternoon", "tonight", "tomorrow night", "today", "friday", "weekend"]) {
      const { start, end } = search(q).filters.dateRange;
      expect(Date.parse(end) - Date.parse(start)).toBeGreaterThanOrEqual(2 * 3600_000);
    }
  });

  it("weekday + part of day, and next weekday", () => {
    const sat = search("saturday afternoon");
    expect(sat.filters.dateRange).toEqual({ start: "2026-11-21T17:00:00.000Z", end: "2026-11-21T23:00:00.000Z" });
    expect(sat.summary).toBe("Sat afternoon");
    expect(search("friday").filters.dateRange).toEqual({ start: "2026-11-27T14:00:00.000Z", end: "2026-11-28T04:00:00.000Z" });
  });

  it("this weekend, Saturday 09:00 to Sunday 23:00", () => {
    expect(search("this weekend").filters.dateRange).toEqual({ start: "2026-11-21T14:00:00.000Z", end: "2026-11-23T04:00:00.000Z" });
  });

  it("unknown words set no filter", () => {
    expect(search("asdf qwerty")).toEqual({ filters: {}, summary: "All suggestions" });
  });

  it("every result is valid FeedFilters", () => {
    for (const q of ["budget with Maya tomorrow night", "indoor coffee friday morning", "weekend park with lea", "zzz"]) {
      expect(FeedFilters.safeParse(search(q).filters).success).toBe(true);
    }
  });
});
