/**
 * Real hourly weather for Montréal from Open-Meteo (free, no key). Owner: Adel.
 * Used by getWeather() in lib/data/index.js when USE_MOCK_DATA=false.
 *
 * - One request covers the whole 8-day horizon; cached in memory for 30 min.
 * - FORCE_RAIN_DAY=<mon..sun|today> stages rain 13:00–18:00 (Montréal time) that day for the demo.
 *   (Legacy FORCE_RAIN_SAT=true still works and means FORCE_RAIN_DAY=sat.)
 * - If Open-Meteo fails, we log it and fall back to the mock forecast so the feed still loads.
 * Server-only.
 */
import { z } from "zod";
import { buildMockWeather } from "@/lib/mocks/weather";
import { nowLocal, toLocal, weekdayKey } from "@/lib/time";

/** @typedef {import("@/types/domain").HourlyWeatherT} HourlyWeatherT */
/** @typedef {z.infer<typeof WeatherIconSchema>} WeatherIconT */

export const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=45.5017&longitude=-73.5673" +
  "&hourly=temperature_2m,precipitation_probability,weather_code&timezone=UTC&forecast_days=8";

const CACHE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 4000;
const WeatherIconSchema = z.enum(["sun", "partly", "cloud", "rain", "snow", "storm", "fog"]);

/** Open-Meteo hourly response (only the fields we use). Times are "YYYY-MM-DDTHH:mm" in UTC. */
const OpenMeteoResponse = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
  }),
});

/**
 * WMO weather code (Open-Meteo `weather_code`) → our icon.
 * @param {number} code
 * @returns {WeatherIconT}
 */
export function wmoToIcon(code) {
  if (code <= 1) return "sun"; // 0 clear, 1 mainly clear
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm"; // 95, 96, 99 thunderstorm
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain"; // drizzle, rain, showers
  return "cloud";
}

/**
 * Parse an Open-Meteo response into HourlyWeather rows (skips hours with missing values).
 * @param {unknown} json
 * @returns {HourlyWeatherT[]}
 */
export function parseOpenMeteo(json) {
  const { hourly } = OpenMeteoResponse.parse(json);
  /** @type {HourlyWeatherT[]} */
  const out = [];
  hourly.time.forEach((t, i) => {
    const tempC = hourly.temperature_2m[i];
    const rainProb = hourly.precipitation_probability[i];
    const code = hourly.weather_code[i];
    if (tempC == null || rainProb == null || code == null) return;
    out.push({
      time: new Date(`${t}:00Z`).toISOString(),
      tempC: Math.round(tempC * 10) / 10,
      rainProb: Math.min(100, Math.max(0, rainProb)),
      weatherCode: Math.round(code),
      icon: wmoToIcon(code),
    });
  });
  return out;
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Which day the demo rain is staged on, from FORCE_RAIN_DAY (mon..sun or "today", resolved in
 * Montréal time) or the legacy FORCE_RAIN_SAT=true. null = no override.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import("@/types/domain").WeekdayT | null}
 */
export function forcedRainDay(env = process.env) {
  const v = (env.FORCE_RAIN_DAY ?? "").trim().toLowerCase();
  if (v === "today") return weekdayKey(nowLocal());
  if (WEEKDAY_KEYS.includes(v)) return /** @type {import("@/types/domain").WeekdayT} */ (v);
  if (v) console.warn(`[lib/data/weather] Ignoring FORCE_RAIN_DAY=${v}: use mon..sun or today`);
  return env.FORCE_RAIN_SAT === "true" ? "sat" : null;
}

/**
 * Demo override: 13:00–18:00 Montréal time on `day` becomes rainy.
 * @param {HourlyWeatherT[]} hours
 * @param {import("@/types/domain").WeekdayT} day
 * @returns {HourlyWeatherT[]}
 */
export function applyRainyDay(hours, day) {
  return hours.map((w) => {
    const local = toLocal(w.time);
    const rainy = weekdayKey(local) === day && local.hour >= 13 && local.hour < 18;
    return rainy ? { ...w, rainProb: 85, weatherCode: 63, icon: "rain" } : w;
  });
}

/** @type {{ at: number, hours: HourlyWeatherT[] } | null} */
let cache = (globalThis.__sqWeather ??= null);

/**
 * Fetch (or reuse) the 8-day hourly forecast. Never throws: falls back to mock weather.
 * @param {{ fetchImpl?: typeof fetch, now?: number }} [opts]  injectable for tests
 * @returns {Promise<{ hours: HourlyWeatherT[], source: "open-meteo" | "mock-fallback" }>}
 */
export async function fetchForecast({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cache && now - cache.at < CACHE_MS) return { hours: cache.hours, source: "open-meteo" };
  try {
    const res = await fetchImpl(OPEN_METEO_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const hours = parseOpenMeteo(await res.json());
    if (hours.length === 0) throw new Error("empty forecast");
    cache = globalThis.__sqWeather = { at: now, hours };
    return { hours, source: "open-meteo" };
  } catch (err) {
    console.warn(`[lib/data/weather] Open-Meteo failed, using mock forecast: ${err instanceof Error ? err.message : err}`);
    return { hours: buildMockWeather(8), source: "mock-fallback" };
  }
}

/** Test helper: forget the cached forecast. */
export function clearWeatherCache() {
  cache = globalThis.__sqWeather = null;
}

/**
 * Hourly weather overlapping `range`, with the FORCE_RAIN_DAY override applied.
 * @param {import("@/types/domain").TimeRangeT} range
 * @param {{ fetchImpl?: typeof fetch, now?: number, rainDay?: import("@/types/domain").WeekdayT | null }} [opts]
 *   rainDay: undefined = read env, null = no override, "sun" etc. = force that day.
 * @returns {Promise<HourlyWeatherT[]>}
 */
export async function getRealWeather(range, opts = {}) {
  const rainDay = opts.rainDay === undefined ? forcedRainDay() : opts.rainDay;
  const { hours } = await fetchForecast(opts);
  const start = Date.parse(range.start);
  const end = Date.parse(range.end);
  const inRange = hours.filter((w) => {
    const t = Date.parse(w.time);
    return t < end && t + 3_600_000 > start;
  });
  return rainDay ? applyRainyDay(inRange, rainDay) : inRange;
}
