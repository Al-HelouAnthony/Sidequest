/**
 * Skeleton tests for Parts 2–9: one core check per part. Edge cases come in the harden pass.
 * All on the fixed fixture: now = Fri 2026-11-20 20:00 Montréal; rain Sat 13:00–18:00.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DateTime } from "luxon";
import { FeedCard } from "@/types/feed";
import { TIMEZONE } from "@/types/domain";
import { DEMO_USER_ID } from "@/lib/mocks/users";
import { mockPlaces } from "@/lib/mocks/places";
import { ENGINE, LEARNING, SCORE_WEIGHTS } from "./config";
import { FIXED_NOW, makeCtx } from "./fixtures";
import { buildTicks, freeMask } from "./slots";
import { generateCandidates, openMask } from "./candidates";
import { scoreCandidate } from "./scoring";
import { bestPerPlace, diversify } from "./diversify";
import { buildFeed } from "./index";

const local = (iso) => DateTime.fromISO(iso, { zone: "utc" }).setZone(TIMEZONE);

describe("Part 2: buildTicks", () => {
  it("starts ≥ now + lead time and only covers waking hours", () => {
    const ticks = buildTicks(FIXED_NOW);
    // Fri 20:00 + 60 min → first tick 21:00; Fri has 21:00–22:30 (4 ticks) + 6 full days × 28.
    expect(ticks).toHaveLength(4 + 6 * 28);
    expect(local(ticks[0].startIso).toFormat("ccc HH:mm")).toBe("Fri 21:00");
    for (const t of ticks) expect(t.minuteOfDay >= 9 * 60 && t.minuteOfDay + ENGINE.tickMin <= 23 * 60).toBe(true);
  });

  it("a morning start gives the full 7 × 28 grid", () => {
    expect(buildTicks(FIXED_NOW.set({ hour: 7 }))).toHaveLength(7 * 28);
  });
});

describe("Part 3: freeMask", () => {
  it("a 12:15–13:00 block makes the 12:00 tick busy and leaves 13:00 free", () => {
    const ticks = buildTicks(FIXED_NOW.set({ hour: 7 }));
    const day = FIXED_NOW.set({ hour: 0 });
    const block = { userId: DEMO_USER_ID, startAt: day.set({ hour: 12, minute: 15 }).toUTC().toISO(), endAt: day.set({ hour: 13 }).toUTC().toISO(), source: "seed" };
    const mask = freeMask([block], ticks);
    const at = (h, m) => ticks.findIndex((t) => t.dayIndex === 0 && t.minuteOfDay === h * 60 + m);
    expect(mask[at(11, 30)]).toBe(1);
    expect(mask[at(12, 0)]).toBe(0);
    expect(mask[at(12, 30)]).toBe(0);
    expect(mask[at(13, 0)]).toBe(1);
  });
});

describe("Part 4: openMask", () => {
  const ticks = buildTicks(FIXED_NOW);
  it("museum (no Monday hours) is never open on Monday", () => {
    const museum = mockPlaces.find((p) => p.name === "Musée des beaux-arts");
    const open = openMask(museum, ticks);
    expect(ticks.filter((t) => t.weekday === "mon").every((t) => open[t.i] === 0)).toBe(true);
  });
  it("a bar closing after midnight (15:00–03:00) is open at 22:30", () => {
    const bar = mockPlaces.find((p) => p.name === "Bily Kun");
    const open = openMask(bar, ticks);
    const t = ticks.find((x) => x.weekday === "sat" && x.minuteOfDay === 22 * 60 + 30);
    expect(open[t.i]).toBe(1);
  });
});

describe("Parts 5–6: generateCandidates (hard constraints)", () => {
  const ctx = makeCtx();
  const ticks = buildTicks(ctx.now);
  const { candidates, dropped, windows } = generateCandidates(ctx, ticks);

  it("produces candidates and accounts for every window", () => {
    expect(candidates.length).toBeGreaterThan(0);
    const windowDrops = dropped.closed + dropped.busy + dropped.rain + dropped.noWeather + dropped.noFriends;
    expect(windowDrops + candidates.length).toBe(windows);
  });

  it("no outdoor place during the staged Saturday rain", () => {
    const bad = candidates.filter((c) => {
      if (c.place.indoor) return false;
      const s = local(new Date(c.startMs).toISOString());
      const e = local(new Date(c.endMs).toISOString());
      return s.weekday === 6 && s.hour < 18 && e.hour > 13;
    });
    expect(bad).toEqual([]);
  });

  it("every candidate has ≥ 1 friend and nobody travels over the cap", () => {
    for (const c of candidates) {
      expect(c.friendIds.length).toBeGreaterThanOrEqual(ENGINE.minFriends);
      expect(c.myMin).toBeLessThanOrEqual(ENGINE.maxTravelMin);
    }
  });

  it("a place I can't reach is dropped entirely", () => {
    const place = mockPlaces[0];
    const far = makeCtx();
    far.travel.set(`${DEMO_USER_ID}:${place.id}`, { ...far.travel.get(`${DEMO_USER_ID}:${place.id}`), minutes: 99 });
    expect(generateCandidates(far, ticks).candidates.some((c) => c.place.id === place.id)).toBe(false);
  });
});

describe("Part 7d: scoreCandidate", () => {
  const ctx = makeCtx();
  const c = generateCandidates(ctx, buildTicks(ctx.now)).candidates[0];

  it("score = Σ weight × component, all components in 0–1", () => {
    const { score, breakdown } = scoreCandidate(c, ctx);
    const sum = Object.entries(breakdown).reduce((s, [k, v]) => s + SCORE_WEIGHTS[k] * v, 0);
    expect(score).toBeCloseTo(sum, 10);
    for (const v of Object.values(breakdown)) expect(v >= 0 && v <= 1).toBe(true);
  });

  it("a suppressed category is multiplied by suppressFactor", () => {
    const base = scoreCandidate(c, ctx).score;
    const sup = makeCtx({ tagWeights: { [`cat:${c.place.category}`]: LEARNING.suppressAt } });
    // interest also drops (category weight is part of it), so suppressed ≤ base × factor
    expect(scoreCandidate(c, sup).score).toBeLessThanOrEqual(base * LEARNING.suppressFactor + 1e-9);
  });
});

describe("Part 8: bestPerPlace + diversify", () => {
  it("one item per place, and no category three times in a row when avoidable", () => {
    const items = [
      { place: { id: "a", category: "bar" }, score: 0.9 },
      { place: { id: "a", category: "bar" }, score: 0.5 },
      { place: { id: "b", category: "bar" }, score: 0.85 },
      { place: { id: "c", category: "bar" }, score: 0.8 },
      { place: { id: "d", category: "cafe" }, score: 0.7 },
    ];
    const out = diversify(bestPerPlace(items));
    expect(out.map((x) => x.place.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(out.slice(0, 3).every((x) => x.place.category === "bar")).toBe(false);
  });
});

describe("Part 9: buildFeed", () => {
  const { cards, debug } = buildFeed(makeCtx(), { debug: true });

  it("returns valid FeedCards, no place twice, ids unique", () => {
    expect(cards.length).toBeGreaterThan(5);
    expect(() => z.array(FeedCard).parse(cards)).not.toThrow();
    expect(new Set(cards.map((c) => c.place.id)).size).toBe(cards.length);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  });

  it("every slot is in the future (≥ lead time) and inside waking hours", () => {
    for (const c of cards) {
      expect(Date.parse(c.slot.start)).toBeGreaterThanOrEqual(FIXED_NOW.toMillis() + ENGINE.minLeadMin * 60_000);
      const s = local(c.slot.start);
      const e = local(c.slot.end);
      expect(s.hour).toBeGreaterThanOrEqual(9);
      expect(e.hour * 60 + e.minute).toBeLessThanOrEqual(23 * 60);
    }
  });

  it("is fast and reports debug counts", () => {
    expect(debug.ms).toBeLessThan(500);
    expect(debug.places).toBe(cards.length);
  });

  it("filters: categories, priceMax, friendIds, dateRange", () => {
    const ctx = makeCtx();
    expect(buildFeed(ctx, { filters: { categories: ["cafe"] } }).cards.every((c) => c.place.category === "cafe")).toBe(true);
    expect(buildFeed(ctx, { filters: { priceMax: 1 } }).cards.every((c) => c.place.priceLevel <= 1)).toBe(true);
    const maya = ctx.friends.find((f) => f.user.name === "Maya").user.id;
    expect(buildFeed(ctx, { filters: { friendIds: [maya] } }).cards.every((c) => c.friends.some((f) => f.id === maya))).toBe(true);
    const sat = { start: FIXED_NOW.plus({ days: 1 }).startOf("day").toUTC().toISO(), end: FIXED_NOW.plus({ days: 2 }).startOf("day").toUTC().toISO() };
    expect(buildFeed(ctx, { filters: { dateRange: sat } }).cards.every((c) => local(c.slot.start).weekday === 6)).toBe(true);
  });
});
