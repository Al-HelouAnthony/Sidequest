/** Harden pass, Parts 2–3: time grid + free masks. */
import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/types/domain";
import { ENGINE } from "./config";
import { FIXED_NOW } from "./fixtures";
import { allTrue, buildTicks, freeMask, isContiguous } from "./slots";

const MORNING = FIXED_NOW.set({ hour: 7 }); // Fri 07:00 → full grid from Fri 09:00
const ticks = buildTicks(MORNING);
const at = (day, h, m = 0) => ticks.find((t) => t.dayIndex === day && t.minuteOfDay === h * 60 + m);
const iso = (day, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return MORNING.startOf("day").plus({ days: day }).set({ hour: h, minute: m }).toUTC().toISO();
};
const block = (day, from, to, dayTo = day) => ({ userId: "u", startAt: iso(day, from), endAt: iso(dayTo, to), source: "seed" });
const busyAt = (mask, day, h, m = 0) => mask[at(day, h, m).i] === 0;

describe("buildTicks", () => {
  it("every day: 28 ticks from 09:00 to 22:30, contiguous within the day", () => {
    for (let d = 0; d < 7; d++) {
      const day = ticks.filter((t) => t.dayIndex === d);
      expect(day).toHaveLength(28);
      expect(day[0].minuteOfDay).toBe(9 * 60);
      expect(day.at(-1).minuteOfDay).toBe(22 * 60 + 30);
    }
  });

  it("rounds the lead time UP to the next tick (now 20:10 → first tick 21:30)", () => {
    const t = buildTicks(FIXED_NOW.set({ minute: 10 }));
    expect(t[0].startMs).toBeGreaterThanOrEqual(FIXED_NOW.set({ minute: 10 }).toMillis() + ENGINE.minLeadMin * 60_000);
    expect(t[0].minuteOfDay).toBe(21 * 60 + 30);
  });

  it("now after 22:00 → nothing today, tomorrow starts at 09:00", () => {
    const t = buildTicks(FIXED_NOW.set({ hour: 22, minute: 30 }));
    expect(t[0].dayIndex).toBe(1);
    expect(t[0].minuteOfDay).toBe(9 * 60);
  });

  it("daylight saving (week of Mar 8, 2026): local times stay 09:00–22:30 every day", () => {
    const t = buildTicks(DateTime.fromISO("2026-03-06T07:00:00", { zone: TIMEZONE }));
    expect(t).toHaveLength(7 * 28);
    for (const tick of t) {
      const local = DateTime.fromMillis(tick.startMs, { zone: TIMEZONE });
      expect(local.hour * 60 + local.minute).toBe(tick.minuteOfDay);
    }
    // Every tick is exactly 30 min long even across the DST jump.
    for (const tick of t) expect(tick.endMs - tick.startMs).toBe(30 * 60_000);
  });
});

describe("freeMask", () => {
  it("no blocks → free everywhere", () => {
    expect(freeMask([], ticks).every((v) => v === 1)).toBe(true);
  });

  it("back-to-back blocks 10–11 and 11–12: busy 10:00–11:30, free at 12:00", () => {
    const m = freeMask([block(0, "10:00", "11:00"), block(0, "11:00", "12:00")], ticks);
    expect(busyAt(m, 0, 9, 30)).toBe(false);
    for (const [h, mm] of [[10, 0], [10, 30], [11, 0], [11, 30]]) expect(busyAt(m, 0, h, mm)).toBe(true);
    expect(busyAt(m, 0, 12)).toBe(false);
  });

  it("overlapping and unsorted blocks", () => {
    const m = freeMask([block(0, "14:00", "16:00"), block(0, "13:00", "14:30")], ticks);
    expect(busyAt(m, 0, 12, 30)).toBe(false);
    expect(busyAt(m, 0, 13)).toBe(true);
    expect(busyAt(m, 0, 15, 30)).toBe(true);
    expect(busyAt(m, 0, 16)).toBe(false);
  });

  it("a block crossing midnight (Fri 22:00 → Sat 01:00) only touches Fri evening", () => {
    const m = freeMask([block(0, "22:00", "01:00", 1)], ticks);
    expect(busyAt(m, 0, 21, 30)).toBe(false);
    expect(busyAt(m, 0, 22)).toBe(true);
    expect(busyAt(m, 0, 22, 30)).toBe(true);
    expect(busyAt(m, 1, 9)).toBe(false);
  });

  it("a block outside waking hours (06:00–08:30) changes nothing", () => {
    expect(freeMask([block(1, "06:00", "08:30")], ticks).every((v) => v === 1)).toBe(true);
  });

  it("a block ending exactly at a tick start leaves that tick free (end is exclusive)", () => {
    const m = freeMask([block(0, "09:00", "10:00")], ticks);
    expect(busyAt(m, 0, 9, 30)).toBe(true);
    expect(busyAt(m, 0, 10)).toBe(false);
  });

  it("buffer: a class at 10:05 makes 9:30–10:00 busy (no suggestion ends at 10:00); after an 11:00 end, 11:00–11:30 is busy", () => {
    const exact = freeMask([block(1, "10:05", "11:00")], ticks);
    expect(busyAt(exact, 1, 9, 30)).toBe(false); // without a buffer you'd be "free" until 10:05
    const m = freeMask([block(1, "10:05", "11:00")], ticks, ENGINE.bufferMin);
    expect(ENGINE.bufferMin).toBe(15);
    expect(busyAt(m, 1, 9, 30)).toBe(true);
    expect(busyAt(m, 1, 9, 0)).toBe(false);
    expect(busyAt(m, 1, 11, 0)).toBe(true);
    expect(busyAt(m, 1, 11, 30)).toBe(false);
  });

  it("a multi-day block (Sat 12:00 → Mon 12:00) blocks all of Sunday", () => {
    const m = freeMask([block(1, "12:00", "12:00", 3)], ticks);
    expect(ticks.filter((t) => t.dayIndex === 2).every((t) => m[t.i] === 0)).toBe(true);
    expect(busyAt(m, 1, 11, 30)).toBe(false);
    expect(busyAt(m, 3, 12)).toBe(false);
  });
});

describe("allTrue / isContiguous", () => {
  it("allTrue checks exactly the window", () => {
    expect(allTrue([1, 1, 0, 1], 0, 2)).toBe(true);
    expect(allTrue([1, 1, 0, 1], 1, 2)).toBe(false);
  });

  it("a window may not span two days or run off the end", () => {
    const last = at(0, 22, 30).i;
    expect(isContiguous(ticks, last - 1, 2)).toBe(true);
    expect(isContiguous(ticks, last, 2)).toBe(false); // 22:30 Fri + 09:00 Sat
    expect(isContiguous(ticks, ticks.length - 1, 2)).toBe(false);
  });
});
