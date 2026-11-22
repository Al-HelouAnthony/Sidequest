/** N2 (variety per visit) + N3 (endless paging). Fixture only: no network, no Claude. */
import { describe, expect, it } from "vitest";
import { makeCtx } from "./fixtures";
import { buildFeed } from "./index";
import { ENGINE } from "./config";
import { nextCursor, noise, parseCursor } from "./variety";

const ctx = makeCtx();
const ids = (cards) => cards.map((c) => c.place.id);
const base = buildFeed(ctx).cards;

describe("noise", () => {
  it("is deterministic and within [-1, 1]", () => {
    expect(noise(42, "a")).toBe(noise(42, "a"));
    for (let s = 0; s < 200; s++) {
      const n = noise(s, "place");
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    }
    expect(new Set(Array.from({ length: 50 }, (_, s) => noise(s, "x").toFixed(6))).size).toBeGreaterThan(45);
  });
});

describe("N2: weighted shuffle per visit", () => {
  it("no seed → exactly today's order (nothing changes for callers that don't send one)", () => {
    expect(buildFeed(ctx, {}).cards.map((c) => c.id)).toEqual(base.map((c) => c.id));
  });

  it("same seed → same order (pages of one visit agree); different seeds → different orders", () => {
    expect(ids(buildFeed(ctx, { seed: 7 }).cards)).toEqual(ids(buildFeed(ctx, { seed: 7 }).cards));
    const orders = new Set([1, 2, 3, 4, 5, 6].map((s) => ids(buildFeed(ctx, { seed: s }).cards).slice(0, 10).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("card scores and breakdowns stay the TRUE values (match % never random)", () => {
    const trueScore = new Map(base.map((c) => [c.place.id, c.score]));
    for (const c of buildFeed(ctx, { seed: 99 }).cards) {
      if (trueScore.has(c.place.id) && c.id === base.find((b) => b.place.id === c.place.id)?.id) expect(c.score).toBe(trueScore.get(c.place.id));
    }
  });

  it("the best stay near the top: card #1 always from the normal top 9, top 3 inside the normal top 10 on ≥ 75% of visits", { timeout: 20_000 }, () => {
    // Jitter 0.07 (was 0.05, the same places kept the top 5 visit after visit). Still bounded: the top of the
    // feed is a reshuffle of the best ideas, not random. After the first two cards, the variety rule can also
    // promote a new category (e.g. a viewpoint).
    const baseIds = ids(base);
    let top3Ok = 0;
    for (let s = 0; s < 40; s++) {
      const top = ids(buildFeed(ctx, { seed: s }).cards).slice(0, 3);
      expect(baseIds.indexOf(top[0])).toBeLessThan(9);
      if (top.every((id) => baseIds.indexOf(id) < 10)) top3Ok++;
    }
    expect(top3Ok).toBeGreaterThanOrEqual(30); // 75% of 40 (measured 31 on this 18-place fixture)
  });

  it("places seen in earlier visits move down", () => {
    const first = base[0].place.id;
    const pos = (cards) => ids(cards).indexOf(first);
    expect(pos(buildFeed(ctx, { seen: [first] }).cards)).toBeGreaterThan(pos(base));
  });

  it("hard rules are untouched by the shuffle: same set of places", () => {
    expect(new Set(ids(buildFeed(ctx, { seed: 123 }).cards))).toEqual(new Set(ids(base)));
  });
});

describe("N3: endless passes", () => {
  const p1 = buildFeed(ctx, { seed: 5, pass: 1 }).cards;
  const p2 = buildFeed(ctx, { seed: 5, pass: 2 }).cards;
  const p3 = buildFeed(ctx, { seed: 5, pass: 3 }).cards;
  const p4 = buildFeed(ctx, { seed: 5, pass: 4 }).cards;

  it("pass 2 = other good slots of the same places, never a card already shown", () => {
    expect(p2.length).toBeGreaterThan(0);
    const p1ById = new Map(p1.map((c) => [c.place.id, c]));
    const shownIds = new Set(p1.map((c) => c.id));
    for (const c of p2) {
      expect(p1ById.has(c.place.id)).toBe(true);
      expect(shownIds.has(c.id)).toBe(false);
      expect(c.slot.start.slice(0, 10)).not.toBe(p1ById.get(c.place.id).slot.start.slice(0, 10));
    }
  });

  it("pass ≥ 3 = loop: same places as pass 1, unique ids per pass, reshuffled each loop", () => {
    expect(new Set(ids(p3))).toEqual(new Set(ids(p1)));
    expect(p3.every((c) => c.id.endsWith(":p3"))).toBe(true);
    expect(p4.every((c) => c.id.endsWith(":p4"))).toBe(true);
    expect([ids(p1).join(), ids(p3).join(), ids(p4).join()].some((o, _, a) => o !== a[0])).toBe(true);
  });
});

describe("cursor paging", () => {
  const P = ENGINE.pageSize;
  it("parses pass:offset and legacy numbers", () => {
    expect(parseCursor(null)).toEqual({ pass: 1, offset: 0 });
    expect(parseCursor("20")).toEqual({ pass: 1, offset: 20 });
    expect(parseCursor("3:10")).toEqual({ pass: 3, offset: 10 });
    expect(parseCursor("garbage")).toEqual({ pass: 1, offset: 0 });
  });

  it("main feed never ends; searches stop after pass 2; empty feeds end", () => {
    expect(nextCursor({ pass: 1, offset: 0, pageSize: P, length: 25, pass2Length: 9, filtered: false })).toBe("1:10");
    expect(nextCursor({ pass: 1, offset: 20, pageSize: P, length: 25, pass2Length: 9, filtered: false })).toBe("2:0");
    expect(nextCursor({ pass: 1, offset: 20, pageSize: P, length: 25, pass2Length: 0, filtered: false })).toBe("3:0");
    expect(nextCursor({ pass: 2, offset: 0, pageSize: P, length: 9, pass2Length: 0, filtered: false })).toBe("3:0");
    expect(nextCursor({ pass: 7, offset: 20, pageSize: P, length: 25, pass2Length: 0, filtered: false })).toBe("8:0");
    expect(nextCursor({ pass: 2, offset: 0, pageSize: P, length: 9, pass2Length: 0, filtered: true })).toBeNull();
    expect(nextCursor({ pass: 1, offset: 0, pageSize: P, length: 3, pass2Length: 0, filtered: true })).toBeNull();
    expect(nextCursor({ pass: 1, offset: 0, pageSize: P, length: 0, pass2Length: 0, filtered: false })).toBeNull();
  });
});
