/**
 * "Start a sidequest now": the best place + friends for a plan starting in a few minutes. Owner: Anthony.
 * Pure (data comes in via ctx). Same hard rules as the feed, minus the 60-min lead time:
 *  - our own places only (verified hours; events have fixed times, registry/venues assumed hours);
 *  - open for the whole window (isOpenDuring), within the travel cap for me and each friend;
 *  - no outdoor place when rain is likely in that window;
 *  - I'm free, and at least one friend is free for the whole window (their busy blocks).
 * Best = most free friends, then the shortest longest trip (fairness), then my own trip.
 */
import { ENGINE } from "./config";
import { travelKey } from "./context";
import { isOpenDuring, reachable, windowWeather } from "./candidates";

/** @typedef {import("./context").EngineContext} EngineContext */

/**
 * @param {EngineContext} ctx
 * @param {number} startMs
 * @param {number} endMs
 * @param {typeof ENGINE} [cfg]
 * @returns {{ place: import("@/types/domain").PlaceT, friendIds: string[] } | null}
 */
export function pickRightNow(ctx, startMs, endMs, cfg = ENGINE) {
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const free = (/** @type {string} */ userId) =>
    !(ctx.busyByUser.get(userId) ?? []).some((b) => Date.parse(b.startAt) < endMs && Date.parse(b.endAt) > startMs);
  if (!free(ctx.me.id)) return null;

  /** @type {{ place: import("@/types/domain").PlaceT, friendIds: string[], maxTravel: number, myMin: number } | null} */
  let best = null;
  for (const place of ctx.places) {
    if (place.source === "event" || place.source === "registry" || place.hoursVerified === false) continue;
    if (!isOpenDuring(place, startIso, endIso)) continue;
    if (!place.indoor) {
      const weather = windowWeather(ctx, startMs, endMs);
      if (!weather || weather.rainProb > cfg.rainCutoff) continue;
    }
    const reach = reachable(ctx, place, cfg);
    if (!reach) continue;
    const friendIds = reach.friendIds.filter(free);
    if (friendIds.length < cfg.minFriends) continue;
    const maxTravel = Math.max(reach.myMin, ...friendIds.map((id) => ctx.travel.get(travelKey(id, place.id))?.minutes ?? Infinity));
    const better =
      !best ||
      friendIds.length > best.friendIds.length ||
      (friendIds.length === best.friendIds.length && (maxTravel < best.maxTravel || (maxTravel === best.maxTravel && reach.myMin < best.myMin)));
    if (better) best = { place, friendIds, maxTravel, myMin: reach.myMin };
  }
  return best ? { place: best.place, friendIds: best.friendIds } : null;
}

/**
 * The window for a plan "now": starts in `leadMin` (rounded up to 5 min), lasts `durationMin`.
 * @param {number} nowMs @param {number} [leadMin] @param {number} [durationMin]
 */
export function rightNowWindow(nowMs, leadMin = 10, durationMin = 60) {
  const five = 5 * 60_000;
  const startMs = Math.ceil((nowMs + leadMin * 60_000) / five) * five;
  return { startMs, endMs: startMs + durationMin * 60_000 };
}
