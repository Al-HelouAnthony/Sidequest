/** Harden pass, Parts 4–6: opening hours, travel + rain gates, candidate generation. */
import { describe, expect, it } from "vitest";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";
import { ENGINE } from "./config";
import { hourKey, travelKey } from "./context";
import { FIXED_NOW, makeCtx } from "./fixtures";
import { buildTicks } from "./slots";
import { generateCandidates, openMask, reachable, windowWeather } from "./candidates";

const MORNING = FIXED_NOW.set({ hour: 7 }); // grid starts Fri 09:00
const ticks = buildTicks(MORNING);
const at = (day, h, m = 0) => ticks.find((t) => t.dayIndex === day && t.minuteOfDay === h * 60 + m);
const [, maya, karim] = mockUsers;

/** A test place near McGill, open every day 09:00–23:00 unless overridden. */
const place = (over = {}) => {
  const all = { open: "09:00", close: "23:00" };
  return {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Test spot",
    category: "cafe",
    tags: ["coffee"],
    lat: 45.505,
    lng: -73.575,
    address: "x",
    priceLevel: 1,
    photoUrl: "x",
    hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [all]])),
    typicalDurationMin: 60,
    indoor: true,
    ...over,
  };
};

/** Context with one place, nobody busy, sunny weather. */
const ctxWith = (p, over = {}) => makeCtx({ now: MORNING, places: [p], busyBlocks: [], ...over });

describe("openMask", () => {
  const fri = (hours) => place({ hours: { fri: hours } });
  const isOpen = (p, h, m = 0) => openMask(p, ticks)[at(0, h, m).i] === 1;

  it("lunch + dinner hours: closed in the gap", () => {
    const p = fri([{ open: "11:30", close: "14:00" }, { open: "17:30", close: "22:00" }]);
    expect(isOpen(p, 11)).toBe(false);
    expect(isOpen(p, 11, 30)).toBe(true);
    expect(isOpen(p, 13, 30)).toBe(true);
    expect(isOpen(p, 14)).toBe(false);
    expect(isOpen(p, 17, 30)).toBe(true);
    expect(isOpen(p, 21, 30)).toBe(true);
    expect(isOpen(p, 22)).toBe(false);
  });

  it("a tick must fit fully before closing (close 16:45 → 16:30 tick closed)", () => {
    expect(isOpen(fri([{ open: "09:00", close: "17:00" }]), 16, 30)).toBe(true);
    expect(isOpen(fri([{ open: "09:00", close: "16:45" }]), 16, 30)).toBe(false);
  });

  it("opening at 09:15 → 09:00 tick closed, 09:30 open", () => {
    const p = fri([{ open: "09:15", close: "18:00" }]);
    expect(isOpen(p, 9)).toBe(false);
    expect(isOpen(p, 9, 30)).toBe(true);
  });

  it("closing at midnight or later (00:00, 03:00) is open until our day ends", () => {
    expect(isOpen(fri([{ open: "17:00", close: "00:00" }]), 22, 30)).toBe(true);
    expect(isOpen(fri([{ open: "17:00", close: "03:00" }]), 22, 30)).toBe(true);
    expect(isOpen(fri([{ open: "17:00", close: "03:00" }]), 16, 30)).toBe(false);
  });

  it("open 24 h (00:00–00:00) is open all day; a missing weekday is closed", () => {
    expect(isOpen(fri([{ open: "00:00", close: "00:00" }]), 9)).toBe(true);
    const sat = ticks.filter((t) => t.dayIndex === 1);
    expect(sat.every((t) => openMask(fri([{ open: "00:00", close: "00:00" }]), ticks)[t.i] === 0)).toBe(true);
  });
});

describe("reachable", () => {
  it("no travel row for me → place unreachable (never invented)", () => {
    const p = place();
    const ctx = ctxWith(p);
    ctx.travel.delete(travelKey(DEMO_USER_ID, p.id));
    expect(reachable(ctx, p)).toBeNull();
  });

  it("no travel row for a friend → just that friend is excluded", () => {
    const p = place();
    const ctx = ctxWith(p);
    ctx.travel.delete(travelKey(maya.id, p.id));
    const r = reachable(ctx, p);
    expect(r).not.toBeNull();
    expect(r.friendIds).not.toContain(maya.id);
    expect(r.friendIds).toContain(karim.id);
  });

  it("exactly at the cap is OK, one minute over is not", () => {
    const p = place();
    const ctx = ctxWith(p);
    const set = (id, minutes) => ctx.travel.set(travelKey(id, p.id), { ...ctx.travel.get(travelKey(id, p.id)), minutes });
    set(maya.id, ENGINE.maxTravelMin);
    set(karim.id, ENGINE.maxTravelMin + 1);
    const r = reachable(ctx, p);
    expect(r.friendIds).toContain(maya.id);
    expect(r.friendIds).not.toContain(karim.id);
    set(DEMO_USER_ID, ENGINE.maxTravelMin + 1);
    expect(reachable(ctx, p)).toBeNull();
  });
});

describe("windowWeather + rain gate", () => {
  const weatherAt = (rainByHour) =>
    Array.from({ length: 9 * 24 }, (_, h) => {
      const t = MORNING.startOf("day").plus({ hours: h });
      const rain = rainByHour(t) ?? 0;
      return { time: t.toUTC().toISO(), tempC: 5, rainProb: rain, weatherCode: rain > 50 ? 63 : 1, icon: rain > 50 ? "rain" : "sun" };
    });

  it("takes the wettest hour and the average temperature", () => {
    const ctx = ctxWith(place(), { weather: weatherAt((t) => (t.day === MORNING.day && t.hour === 13 ? 70 : 10)) });
    const w = windowWeather(ctx, at(0, 12, 30).startMs, at(0, 13, 30).endMs);
    expect(w).toEqual({ icon: "rain", tempC: 5, rainProb: 70 });
  });

  it("a missing weather hour → null (dropped as noWeather, never guessed)", () => {
    const ctx = ctxWith(place());
    ctx.weatherByHour.delete(hourKey(at(0, 12).startMs));
    expect(windowWeather(ctx, at(0, 12).startMs, at(0, 13).startMs)).toBeNull();
  });

  it("outdoor: rain exactly at the cutoff is allowed, one point above is blocked", () => {
    const fri13 = (t) => t.day === MORNING.day && t.hour === 13;
    const count = (rain) => {
      const ctx = ctxWith(place({ indoor: false }), { weather: weatherAt((t) => (fri13(t) ? rain : 0)) });
      return generateCandidates(ctx, ticks).candidates.filter((c) => c.startMs <= at(0, 13).startMs && c.endMs > at(0, 13).startMs).length;
    };
    expect(count(ENGINE.rainCutoff)).toBeGreaterThan(0);
    expect(count(ENGINE.rainCutoff + 1)).toBe(0);
  });

  it("indoor places are never rain-blocked", () => {
    const ctx = ctxWith(place({ indoor: true }), { weather: weatherAt(() => 100) });
    const { candidates, dropped } = generateCandidates(ctx, ticks);
    expect(candidates.length).toBeGreaterThan(0);
    expect(dropped.rain).toBe(0);
  });
});

describe("generateCandidates", () => {
  it("visit length rounds up to whole ticks, minimum 60 min", () => {
    const len = (min) => generateCandidates(ctxWith(place({ typicalDurationMin: min })), ticks).candidates[0].nTicks;
    expect(len(30)).toBe(2);
    expect(len(60)).toBe(2);
    expect(len(75)).toBe(3);
    expect(len(120)).toBe(4);
  });

  it("only me free → no candidates (needs ≥ 1 friend), counted as noFriends", () => {
    const p = place();
    const everyoneElseBusy = makeCtx().friends.map((f) => ({
      userId: f.user.id,
      startAt: MORNING.startOf("day").toUTC().toISO(),
      endAt: MORNING.plus({ days: 9 }).toUTC().toISO(),
      source: "seed",
    }));
    const { candidates, dropped } = generateCandidates(ctxWith(p, { busyBlocks: everyoneElseBusy }), ticks);
    expect(candidates).toHaveLength(0);
    expect(dropped.noFriends).toBeGreaterThan(0);
  });

  it("I'm busy → none of my busy windows appear", () => {
    const p = place();
    const meBusy = [{ userId: DEMO_USER_ID, startAt: at(0, 9).startIso, endAt: new Date(at(0, 22, 30).endMs).toISOString(), source: "seed" }];
    const { candidates } = generateCandidates(ctxWith(p, { busyBlocks: meBusy }), ticks);
    expect(candidates.some((c) => ticks[c.startTick].dayIndex === 0)).toBe(false);
  });

  it("required friend who can't reach the place → place dropped (travel)", () => {
    const p = place();
    const ctx = ctxWith(p);
    ctx.travel.set(travelKey(maya.id, p.id), { ...ctx.travel.get(travelKey(maya.id, p.id)), minutes: 99 });
    const { candidates, dropped } = generateCandidates(ctx, ticks, { friendIds: [maya.id] });
    expect(candidates).toHaveLength(0);
    expect(dropped.travel).toBe(1);
  });

  it("required friend busy → that window is dropped, others with them free remain", () => {
    const p = place();
    const mayaBusyFri = [{ userId: maya.id, startAt: at(0, 9).startIso, endAt: new Date(at(0, 22, 30).endMs).toISOString(), source: "seed" }];
    const { candidates } = generateCandidates(ctxWith(p, { busyBlocks: mayaBusyFri }), ticks, { friendIds: [maya.id] });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => ticks[c.startTick].dayIndex !== 0 && c.friendIds.includes(maya.id))).toBe(true);
  });

  it("indoorOnly / categories / priceMax filters drop the place up front", () => {
    const p = place({ indoor: false, category: "park", priceLevel: 3 });
    for (const f of [{ indoorOnly: true }, { categories: ["cafe"] }, { priceMax: 2 }]) {
      const { candidates, dropped } = generateCandidates(ctxWith(p), ticks, f);
      expect(candidates).toHaveLength(0);
      expect(dropped.filters).toBe(1);
    }
  });
});
