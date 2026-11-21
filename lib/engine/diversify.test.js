/** Harden pass, Part 8: best window per place + variety re-rank. */
import { describe, expect, it } from "vitest";
import { ENGINE } from "./config";
import { bestPerPlace, diversify } from "./diversify";

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
