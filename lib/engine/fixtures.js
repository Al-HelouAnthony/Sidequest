/**
 * Deterministic test context for the engine. Owner: Anthony.
 *
 * Fixed "now" = Fri 2026-11-20 20:00 Montréal, so every test sees the same week:
 * tomorrow (Sat 21) has the staged rain 13:00–18:00.
 *
 * Reads lib/mocks (Adel's) but does NOT call its now-relative builders. It expands the same
 * weekly patterns itself from the fixed `now`, so tests never depend on the real clock.
 */
import { DateTime } from "luxon";
import { TIMEZONE } from "@/types/domain";
import { atLocalTime, toIsoUtc, weekdayKey } from "@/lib/time";
import { mockFriendships, mockUsers, DEMO_USER_ID } from "@/lib/mocks/users";
import { mockPlaces } from "@/lib/mocks/places";
import { weeklyPatterns } from "@/lib/mocks/schedules";
import { estimateTravelMin, haversineKm } from "@/lib/data/geo";
import { indexContext } from "./context";

export const FIXED_NOW = DateTime.fromISO("2026-11-20T20:00:00", { zone: TIMEZONE });

/** @param {DateTime} now @param {number} days */
function expandBusy(now, days) {
  const today = now.startOf("day");
  const out = [];
  for (let d = 0; d < days; d++) {
    const day = today.plus({ days: d });
    const key = weekdayKey(day);
    for (const [userId, patterns] of Object.entries(weeklyPatterns)) {
      for (const p of patterns) {
        if (!p.days.includes(key)) continue;
        out.push({ userId, startAt: toIsoUtc(atLocalTime(day, p.start)), endAt: toIsoUtc(atLocalTime(day, p.end)), source: /** @type {const} */ ("seed") });
      }
    }
  }
  return out;
}

/** Hourly weather; Saturday 13:00–18:00 local is rainy (85 %). @param {DateTime} now @param {number} days */
function fixedWeather(now, days) {
  const start = now.startOf("day");
  const out = [];
  for (let h = 0; h < days * 24; h++) {
    const t = start.plus({ hours: h });
    const rainy = t.weekday === 6 && t.hour >= 13 && t.hour < 18;
    const night = t.hour < 7 || t.hour >= 18;
    out.push({
      time: toIsoUtc(t),
      tempC: night ? -1 : 4,
      rainProb: rainy ? 85 : 10,
      weatherCode: rainy ? 63 : night ? 3 : 1,
      icon: /** @type {const} */ (rainy ? "rain" : night ? "cloud" : "sun"),
    });
  }
  return out;
}

/**
 * Build an EngineContext for tests. Every field can be overridden.
 * @param {Partial<Parameters<typeof indexContext>[0]> & { userId?: string }} [overrides]
 * @returns {import("./context").EngineContext}
 */
export function makeCtx(overrides = {}) {
  const now = overrides.now ?? FIXED_NOW;
  const userId = overrides.userId ?? DEMO_USER_ID;
  const me = overrides.me ?? mockUsers.find((u) => u.id === userId);
  if (!me) throw new Error(`Unknown fixture user ${userId}`);

  const friends =
    overrides.friends ??
    mockFriendships
      .filter((f) => f.userId === me.id)
      .map((f) => ({ user: /** @type {import("@/types/domain").UserT} */ (mockUsers.find((u) => u.id === f.friendId)), closeness: f.closeness }));
  const places = overrides.places ?? mockPlaces;
  const everyone = [me, ...friends.map((f) => f.user)];

  const travelTimes =
    overrides.travelTimes ??
    everyone.flatMap((u) =>
      places.map((p) => ({
        userId: u.id,
        placeId: p.id,
        minutes: estimateTravelMin(haversineKm(u.homeLat, u.homeLng, p.lat, p.lng)),
        mode: /** @type {const} */ ("foot-walking"),
        isEstimate: true,
      })),
    );

  return indexContext({
    now,
    me,
    friends,
    places,
    busyBlocks: overrides.busyBlocks ?? expandBusy(now, 9),
    weather: overrides.weather ?? fixedWeather(now, 9),
    travelTimes,
    tagWeights: overrides.tagWeights ?? {},
    recentInteractions: overrides.recentInteractions ?? [],
  });
}
