/**
 * MOCK DATA. Realistic student weeks (classes, shifts), regenerated relative to "now"
 * so the next 7 days always have data. Adel's seed script should reuse these patterns.
 */
import { atLocalTime, nowLocal, toIsoUtc, weekdayKey } from "@/lib/time";
import { DEMO_USER_ID, mockUsers } from "./users";

/**
 * @typedef {{ days: import("@/types/domain").WeekdayT[], start: string, end: string, label: string }} Pattern
 * @type {Record<string, Pattern[]>}
 */
export const weeklyPatterns = {
  [DEMO_USER_ID]: [
    { days: ["mon", "wed", "fri"], start: "10:00", end: "12:30", label: "COMP 250" },
    { days: ["tue", "thu"], start: "13:00", end: "16:00", label: "ECSE 324 lab" },
    { days: ["sun"], start: "09:00", end: "12:00", label: "Gym + groceries" },
  ],
  [mockUsers[1].id]: [
    // Maya: classes weekdays, café shift Saturday morning
    { days: ["mon", "tue", "wed", "thu"], start: "09:00", end: "15:00", label: "Classes" },
    { days: ["sat"], start: "09:00", end: "13:00", label: "Shift at café" },
  ],
  [mockUsers[2].id]: [
    // Karim: evening restaurant shifts
    { days: ["wed", "thu", "fri"], start: "17:00", end: "23:00", label: "Shift" },
    { days: ["mon", "tue"], start: "11:00", end: "14:00", label: "Classes" },
  ],
  [mockUsers[3].id]: [
    // Antoine: busy weekdays, free weekends
    { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "17:00", label: "Internship" },
  ],
  [mockUsers[4].id]: [
    { days: ["tue", "thu"], start: "09:00", end: "18:00", label: "Classes" },
    { days: ["sun"], start: "12:00", end: "18:00", label: "Shift" },
  ],
};

/**
 * Expand weekly patterns into concrete busy blocks for the next `days` days.
 * @param {number} [days]
 * @returns {import("@/types/domain").BusyBlockT[]}
 */
export function buildMockBusyBlocks(days = 7) {
  const today = nowLocal().startOf("day");
  /** @type {import("@/types/domain").BusyBlockT[]} */
  const blocks = [];
  for (let d = 0; d < days; d++) {
    const day = today.plus({ days: d });
    const key = weekdayKey(day);
    for (const [userId, patterns] of Object.entries(weeklyPatterns)) {
      for (const p of patterns) {
        if (!p.days.includes(key)) continue;
        blocks.push({
          userId,
          startAt: toIsoUtc(atLocalTime(day, p.start)),
          endAt: toIsoUtc(atLocalTime(day, p.end)),
          source: "seed",
        });
      }
    }
  }
  return blocks;
}
