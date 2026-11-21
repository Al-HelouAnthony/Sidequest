/**
 * MOCK DATA. Hourly November-ish weather for the next 8 days, with a staged
 * rainy Saturday afternoon (13:00–18:00) to demo outdoor filtering.
 */
import { nowLocal, toIsoUtc } from "@/lib/time";

/**
 * @param {number} [days]
 * @returns {import("@/types/domain").HourlyWeatherT[]}
 */
export function buildMockWeather(days = 8) {
  const start = nowLocal().startOf("day");
  const out = [];
  for (let h = 0; h < days * 24; h++) {
    const t = start.plus({ hours: h });
    const hour = t.hour;
    const tempC = Math.round(1 + 5 * Math.sin(((hour - 8) / 24) * 2 * Math.PI));
    const rainySaturday = t.weekday === 6 && hour >= 13 && hour < 18;
    const night = hour < 7 || hour >= 18;
    out.push({
      time: toIsoUtc(t),
      tempC,
      rainProb: rainySaturday ? 85 : night ? 15 : 10,
      weatherCode: rainySaturday ? 63 : night ? 3 : 1,
      icon: /** @type {const} */ (rainySaturday ? "rain" : night ? "cloud" : "sun"),
    });
  }
  return out;
}
