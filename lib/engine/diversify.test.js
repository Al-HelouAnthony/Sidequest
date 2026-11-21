/** Harden pass, Part 8: best window per place + variety re-rank. */
import { describe, expect, it } from "vitest";
import { ENGINE } from "./config";
import { bestPerPlace, bestWindowsPerPlace, diversify } from "./diversify";
import { makeCtx } from "./fixtures";
import { buildFeed } from "./index";
import { toLocal } from "@/lib/time";

const item = (id, category, score) => ({ place: { id, category }, score });
const cats = (list) => list.map((x) => x.place.category).join(",");

describe("bestPerPlace", () => {
  it("keeps the top-scoring window per place, sorted high → low", () => {
    const out = bestPerPlace([item("a", "bar", 0.2), item("b", "cafe", 0.9), item("a", "bar", 0.7)]);
    expect(out.map((x) => [x.place.id, x.score])).toEqual([["b", 0.9], ["a", 0.7]]);
  });

  it("empty in, empty out", () => {
    expect(bestPerPlace([])).toEqual([]);
    expect(diversify([])).toEqual([]);
  });
});

describe("diversify", () => {
  it("keeps every item exactly once", () => {
    const input = [item("a", "bar", 0.9), item("b", "bar", 0.8), item("c", "cafe", 0.5), item("d", "park", 0.4)];
    const out = diversify(input);
    expect(out.map((x) => x.place.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("interleaves when scores are close", () => {
    const out = diversify([item("a", "bar", 0.9), item("b", "bar", 0.88), item("c", "bar", 0.86), item("d", "cafe", 0.85), item("e", "park", 0.84)]);
    expect(cats(out).startsWith("bar,bar,bar")).toBe(false);
  });

  it("a much better item still wins despite the penalty", () => {
    const out = diversify([item("a", "bar", 0.9), item("b", "bar", 0.85), item("c", "cafe", 0.3)]);
    expect(out[1].place.id).toBe("b"); // 0.85 − 0.15 = 0.70 > 0.30
  });

  it("the penalty only looks at the last `diversityWindow` picks", () => {
    // After bar, cafe, park, museum the bar is 4 picks back → no penalty any more.
    const out = diversify(
      [item("a", "bar", 1), item("b", "cafe", 0.99), item("c", "park", 0.98), item("d", "activity", 0.97), item("e", "bar", 0.96), item("f", "viewpoint", 0.9)],
      { ...ENGINE, diversityWindow: 3 },
    );
    expect(out[4].place.id).toBe("e");
  });

  it("does not mutate its input", () => {
    const input = [item("a", "bar", 0.9), item("b", "cafe", 0.5)];
    const copy = JSON.parse(JSON.stringify(input));
    diversify(input);
    expect(input).toEqual(copy);
  });
});

describe("day variety (group + day variety decision)", () => {
  const d = (id, category, score, day) => ({ place: { id, category }, score, day });

  it("bestWindowsPerPlace: best slot per day, at most 2 days per place", () => {
    const out = bestWindowsPerPlace([d("a", "bar", 0.9, 0), d("a", "bar", 0.5, 0), d("a", "bar", 0.8, 1), d("a", "bar", 0.7, 2), d("b", "cafe", 0.6, 0)], 2);
    expect(out.map((x) => [x.place.id, x.day, x.score])).toEqual([["a", 0, 0.9], ["a", 1, 0.8], ["b", 0, 0.6]]);
  });

  it("diversify never shows a place twice, even with 2 slots", () => {
    const out = diversify([d("a", "bar", 0.9, 0), d("a", "bar", 0.85, 1), d("b", "cafe", 0.5, 0)]);
    expect(out.map((x) => x.place.id)).toEqual(["a", "b"]);
  });

  it("close scores on the same day get interleaved with other days", () => {
    const items = [d("a", "cafe", 0.90, 0), d("b", "bar", 0.89, 0), d("c", "park", 0.88, 0), d("c", "park", 0.86, 1), d("e", "viewpoint", 0.85, 1)];
    const days = diversify(items).map((x) => x.day);
    expect(days.slice(0, 3)).not.toEqual([0, 0, 0]);
  });

  it("real feed (fixture): top 10 spans ≥ 2 days, no place twice", () => {
    const top = buildFeed(makeCtx()).cards.slice(0, 10);
    expect(new Set(top.map((c) => toLocal(c.slot.start).toISODate())).size).toBeGreaterThanOrEqual(2);
    expect(new Set(top.map((c) => c.place.id)).size).toBe(top.length);
  });
});
