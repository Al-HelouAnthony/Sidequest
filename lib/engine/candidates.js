/**
 * Parts 4–6: hard constraints + candidate visit windows. Pure. Owner: Anthony.
 *
 * Hard constraints (never violated): place open for the whole visit, everyone involved
 * free for the whole visit, travel ≤ cap, no outdoor place when rain > cutoff.
 * Nothing is invented: missing weekday in `hours` = closed; missing travel row = can't reach.
 */
import { ENGINE } from "./config";
import { hourKey, travelKey } from "./context";
import { allTrue, freeMask, isContiguous } from "./slots";

/** @typedef {import("./slots").Tick} Tick */
/** @typedef {import("./context").EngineContext} EngineContext */
/** @typedef {import("@/types/domain").PlaceT} PlaceT */

/** "HH:mm" → minutes since midnight. @param {string} hhmm */
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Part 4: 1 = open for the whole tick.
 * close < open means "closes after midnight": since ticks end at 23:00 (ENGINE.dayEnd),
 * such an interval is open from `open` to the end of our day; the after-midnight part never matters.
 * @param {PlaceT} place @param {Tick[]} ticks @param {typeof ENGINE} [cfg]
 * @returns {Uint8Array}
 */
export function openMask(place, ticks, cfg = ENGINE) {
  const mask = new Uint8Array(ticks.length);
  for (const t of ticks) {
    const intervals = place.hours[t.weekday] ?? [];
    const m = t.minuteOfDay;
    mask[t.i] = intervals.some((iv) => {
      const open = toMin(iv.open);
      const close = toMin(iv.close);
      return open <= m && (close > open ? m + cfg.tickMin <= close : true);
    })
      ? 1
      : 0;
  }
  return mask;
}

/**
 * Part 5a: who can get there within the cap.
 * @param {EngineContext} ctx @param {PlaceT} place @param {typeof ENGINE} [cfg]
 * @returns {{ myMin: number, friendIds: string[] } | null}  null = I can't reach it → drop the place
 */
export function reachable(ctx, place, cfg = ENGINE) {
  const mine = ctx.travel.get(travelKey(ctx.me.id, place.id));
  if (!mine || mine.minutes > cfg.maxTravelMin) return null;
  const friendIds = ctx.friends
    .map((f) => f.user.id)
    .filter((id) => {
      const t = ctx.travel.get(travelKey(id, place.id));
      return !!t && t.minutes <= cfg.maxTravelMin;
    });
  return { myMin: mine.minutes, friendIds };
}

/**
 * Part 5b: weather over a visit window: max rain, average temp, icon of the rainiest hour.
 * Returns null if any hour is missing (we don't invent weather).
 * @param {EngineContext} ctx @param {number} startMs @param {number} endMs
 * @returns {{ icon: import("@/types/domain").HourlyWeatherT["icon"], tempC: number, rainProb: number } | null}
 */
export function windowWeather(ctx, startMs, endMs) {
  const hours = [];
  for (let h = Number(hourKey(startMs)); h < endMs; h += 3_600_000) {
    const w = ctx.weatherByHour.get(String(h));
    if (!w) return null;
    hours.push(w);
  }
  if (hours.length === 0) return null;
  const wettest = hours.reduce((a, b) => (b.rainProb > a.rainProb ? b : a));
  const tempC = Math.round(hours.reduce((s, w) => s + w.tempC, 0) / hours.length);
  return { icon: wettest.icon, tempC, rainProb: wettest.rainProb };
}

/** @param {PlaceT} place @param {import("@/types/feed").FeedFiltersT} filters */
function passesFilters(place, filters) {
  if (filters.categories?.length && !filters.categories.includes(place.category)) return false;
  if (filters.priceMax !== undefined && place.priceLevel > filters.priceMax) return false;
  if (filters.indoorOnly && !place.indoor) return false;
  if (filters.cuisine && !place.tags.includes(filters.cuisine)) return false; // N1
  return true;
}

/**
 * @typedef {object} Candidate
 * @property {PlaceT} place
 * @property {number} startTick
 * @property {number} nTicks
 * @property {number} startMs
 * @property {number} endMs
 * @property {string[]} friendIds   friends free (and within reach) for the whole visit
 * @property {number} myMin
 * @property {{ icon: import("@/types/domain").HourlyWeatherT["icon"], tempC: number, rainProb: number }} weather
 */

/**
 * Part 6: every feasible (place, visit window). Cheapest checks first.
 * `dropped.filters` / `dropped.travel` count PLACES; the others count WINDOWS.
 * @param {EngineContext} ctx
 * @param {Tick[]} ticks
 * @param {import("@/types/feed").FeedFiltersT} [filters]
 * @param {typeof ENGINE} [cfg]
 */
export function generateCandidates(ctx, ticks, filters = {}, cfg = ENGINE) {
  const dropped = { filters: 0, travel: 0, closed: 0, busy: 0, rain: 0, noWeather: 0, noFriends: 0 };
  /** @type {Candidate[]} */
  const candidates = [];
  let windows = 0;

  const myFree = freeMask(ctx.busyByUser.get(ctx.me.id) ?? [], ticks);
  const friendFree = new Map(ctx.friends.map((f) => [f.user.id, freeMask(ctx.busyByUser.get(f.user.id) ?? [], ticks)]));
  const required = filters.friendIds ?? [];

  for (const place of ctx.places) {
    if (!passesFilters(place, filters)) {
      dropped.filters++;
      continue;
    }
    const reach = reachable(ctx, place, cfg);
    if (!reach || !required.every((id) => reach.friendIds.includes(id))) {
      dropped.travel++;
      continue;
    }
    const open = openMask(place, ticks, cfg);
    const n = Math.ceil(Math.max(cfg.minSlotMin, place.typicalDurationMin) / cfg.tickMin);

    for (let i = 0; i + n <= ticks.length; i++) {
      if (!isContiguous(ticks, i, n, cfg)) continue;
      windows++;
      if (!allTrue(open, i, n)) { dropped.closed++; continue; }
      if (!allTrue(myFree, i, n)) { dropped.busy++; continue; }
      const startMs = ticks[i].startMs;
      const endMs = ticks[i + n - 1].endMs;
      const weather = windowWeather(ctx, startMs, endMs);
      if (!weather) { dropped.noWeather++; continue; }
      if (!place.indoor && weather.rainProb > cfg.rainCutoff) { dropped.rain++; continue; }
      const friendIds = reach.friendIds.filter((id) => allTrue(/** @type {Uint8Array} */ (friendFree.get(id)), i, n));
      if (friendIds.length < cfg.minFriends || !required.every((id) => friendIds.includes(id))) {
        dropped.noFriends++;
        continue;
      }
      candidates.push({ place, startTick: i, nTicks: n, startMs, endMs, friendIds, myMin: reach.myMin, weather });
    }
  }
  return { candidates, dropped, windows };
}
