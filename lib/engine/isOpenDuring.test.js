/** N4 helper: isOpenDuring(place, startIso, endIso). Montréal is UTC−5 in November. */
import { describe, expect, it } from "vitest";
import { isOpenDuring } from "./candidates";

// 2026-11-21 is a Saturday, 2026-11-23 a Monday. Local 18:00 = 23:00Z.
const L = (date, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(...date.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), h + 5, m)).toISOString();
};
const place = (hours) => ({ id: "x", hours });
const restaurant = place({ sat: [{ open: "11:30", close: "14:00" }, { open: "17:00", close: "22:00" }], sun: [{ open: "10:00", close: "15:00" }] });
const bar = place({ fri: [{ open: "20:00", close: "03:00" }], sat: [{ open: "20:00", close: "03:00" }] });

describe("isOpenDuring", () => {
  it("open for the whole visit inside one interval", () => {
    expect(isOpenDuring(restaurant, L("2026-11-21", "18:00"), L("2026-11-21", "20:00"))).toBe(true);
    expect(isOpenDuring(restaurant, L("2026-11-21", "17:00"), L("2026-11-21", "22:00"))).toBe(true); // exact edges
  });

  it("closed if any part of the visit is outside, incl. the split-shift gap", () => {
    expect(isOpenDuring(restaurant, L("2026-11-21", "21:00"), L("2026-11-21", "22:30"))).toBe(false);
    expect(isOpenDuring(restaurant, L("2026-11-21", "13:00"), L("2026-11-21", "18:00"))).toBe(false); // spans the gap
    expect(isOpenDuring(restaurant, L("2026-11-21", "11:00"), L("2026-11-21", "12:00"))).toBe(false);
  });

  it("missing weekday = closed (Monday)", () => {
    expect(isOpenDuring(restaurant, L("2026-11-23", "18:00"), L("2026-11-23", "19:00"))).toBe(false);
  });

  it("after-midnight closing: a visit running past midnight, and one in the previous day's late hours", () => {
    expect(isOpenDuring(bar, L("2026-11-21", "22:00"), L("2026-11-22", "01:00"))).toBe(true); // Sat 22:00 → Sun 01:00
    expect(isOpenDuring(bar, L("2026-11-22", "01:00"), L("2026-11-22", "02:30"))).toBe(true); // Sun 01:00 = Sat's hours
    expect(isOpenDuring(bar, L("2026-11-22", "02:00"), L("2026-11-22", "04:00"))).toBe(false); // past 03:00
    expect(isOpenDuring(bar, L("2026-11-22", "20:00"), L("2026-11-22", "21:00"))).toBe(false); // no Sunday hours
  });

  it("bad input → false (empty, reversed, invalid)", () => {
    expect(isOpenDuring(restaurant, L("2026-11-21", "18:00"), L("2026-11-21", "18:00"))).toBe(false);
    expect(isOpenDuring(restaurant, L("2026-11-21", "20:00"), L("2026-11-21", "18:00"))).toBe(false);
    expect(isOpenDuring(restaurant, "nope", L("2026-11-21", "18:00"))).toBe(false);
  });

  it("agrees with Adel's assumed registry hours (11:30–22:00 daily)", () => {
    const reg = place(Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ open: "11:30", close: "22:00" }]])));
    expect(isOpenDuring(reg, L("2026-11-23", "19:00"), L("2026-11-23", "20:00"))).toBe(true);
    expect(isOpenDuring(reg, L("2026-11-23", "21:30"), L("2026-11-23", "22:30"))).toBe(false);
  });
});
