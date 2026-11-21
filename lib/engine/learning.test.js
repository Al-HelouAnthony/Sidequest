/**
 * Part 10 (learning) + Part 7c (timing wired into scoring).
 */
import { describe, expect, it } from "vitest";
import { mockPlaces } from "@/lib/mocks/places";
import { LEARNING } from "./config";
import { applyInteraction, stepFor } from "./learning";
import { makeCtx } from "./fixtures";
import { buildFeed } from "./index";
import { buildTicks } from "./slots";
import { generateCandidates } from "./candidates";
import { scoreCandidate } from "./scoring";
import { timingScore } from "./timing";
import { toLocal } from "@/lib/time";

const bar = { category: "bar", tags: ["bars", "coffee", "brunch"] };

describe("applyInteraction", () => {
  it("skip: full step on the category, split step on the tags", () => {
    const w = applyInteraction({}, bar, "skip");
    expect(w["cat:bar"]).toBeCloseTo(-LEARNING.beta, 6);
    expect(w.bars).toBeCloseTo(-LEARNING.beta / 3, 4);
    expect(w.coffee).toBeCloseTo(-LEARNING.beta / 3, 4);
  });

  it("save and go push the other way, go more than save", () => {
    expect(stepFor("save")).toBeGreaterThan(0);
    expect(stepFor("go")).toBeGreaterThan(stepFor("save"));
    expect(applyInteraction({}, bar, "go")["cat:bar"]).toBeCloseTo(LEARNING.alpha.go, 6);
  });

  it("two skips reach the suppression threshold", () => {
    const w = applyInteraction(applyInteraction({}, bar, "skip"), bar, "skip");
    expect(w["cat:bar"]).toBeLessThanOrEqual(LEARNING.suppressAt);
  });

  it("clamps to [min, max] and never mutates its input", () => {
    const input = { "cat:bar": -0.9 };
    const w = applyInteraction(applyInteraction(input, bar, "skip"), bar, "skip");
    expect(w["cat:bar"]).toBe(LEARNING.min);
    expect(input).toEqual({ "cat:bar": -0.9 });
    let up = {};
    for (let i = 0; i < 10; i++) up = applyInteraction(up, bar, "go");
    expect(up["cat:bar"]).toBe(LEARNING.max);
  });

  it("a place with no tags still learns the category", () => {
    expect(applyInteraction({}, { category: "park", tags: [] }, "skip")).toEqual({ "cat:park": -LEARNING.beta });
  });
});

describe("demo moment: skip 2 bars → no bars in the top 10", () => {
  it("bars are in the top 10 before, and gone after", () => {
    const before = buildFeed(makeCtx()).cards.slice(0, 10);
    expect(before.some((c) => c.place.category === "bar")).toBe(true);

    const [b1, b2] = mockPlaces.filter((p) => p.category === "bar");
    const learned = applyInteraction(applyInteraction({}, b1, "skip"), b2, "skip");
    const after = buildFeed(makeCtx({ tagWeights: learned })).cards.slice(0, 10);
    expect(after.some((c) => c.place.category === "bar")).toBe(false);
    expect(after.length).toBe(10);
  });

  it("skipping bars doesn't wipe out cafés", () => {
    const bars = mockPlaces.filter((p) => p.category === "bar");
    let w = {};
    for (const b of bars) w = applyInteraction(w, b, "skip");
    const top = buildFeed(makeCtx({ tagWeights: w })).cards.slice(0, 10);
    expect(top.some((c) => c.place.category === "cafe")).toBe(true);
  });
});

describe("timing is Mhammad's timingScore", () => {
  it("breakdown.timing equals timingScore for the slot", () => {
    const ctx = makeCtx();
    for (const c of generateCandidates(ctx, buildTicks(ctx.now)).candidates.slice(0, 50)) {
      const expected = timingScore(c.place.category, new Date(c.startMs).toISOString(), new Date(c.endMs).toISOString());
      expect(scoreCandidate(c, ctx).breakdown.timing).toBe(expected);
    }
  });

  it("bars in the feed are scheduled for the evening", () => {
    const bars = buildFeed(makeCtx()).cards.filter((c) => c.place.category === "bar");
    expect(bars.length).toBeGreaterThan(0);
    for (const c of bars) expect(toLocal(c.slot.start).hour).toBeGreaterThanOrEqual(18);
  });
});
