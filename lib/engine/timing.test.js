import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/types/domain";
import { toIsoUtc } from "@/lib/time";
import { timingScore } from "./timing";

/** A visit starting at a Montréal time (Saturday 2026-11-21). Default length 2 hours. */
function score(category, localStart, hours = 2) {
  const start = DateTime.fromISO(`2026-11-21T${localStart}`, { zone: TIMEZONE });
  return timingScore(category, toIsoUtc(start), toIsoUtc(start.plus({ hours })));
}

describe("timingScore", () => {
  it("bar: 9 PM beats 2 PM", () => {
    expect(score("bar", "20:00")).toBeGreaterThan(score("bar", "13:00"));
  });

  it("restaurant: 12:30 beats 3:30 PM", () => {
    expect(score("restaurant", "11:30")).toBeGreaterThan(score("restaurant", "14:30"));
  });

  it("cafe (breakfast spot): 9 AM scores high, 7 PM scores the floor", () => {
    expect(score("cafe", "08:30")).toBe(1);
    expect(score("cafe", "18:30")).toBe(0.1);
  });

  it("viewpoint: sunset beats noon", () => {
    expect(score("viewpoint", "15:15")).toBeGreaterThan(score("viewpoint", "11:00"));
  });

  it("gives 1 inside the best hours", () => {
    expect(score("restaurant", "11:30")).toBe(1);
  });

  it("a bar visit that crosses midnight still scores well", () => {
    expect(score("bar", "23:00")).toBe(1);
  });

  it("never goes below the floor", () => {
    expect(score("bar", "04:00")).toBe(0.1);
  });

  it("always stays between 0 and 1", () => {
    const categories = ["cafe", "restaurant", "bar", "park", "viewpoint", "activity", "event"];
    for (const category of categories) {
      for (let h = 0; h < 24; h++) {
        const s = score(category, `${String(h).padStart(2, "0")}:00`);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it("unknown category or bad date gives a neutral 0.5", () => {
    expect(score("museum", "12:00")).toBe(0.5);
    expect(timingScore("bar", "not a date", "also not")).toBe(0.5);
  });
});
