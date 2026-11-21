import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HourlyWeather } from "@/types/domain";
import { applyRainySaturday, clearWeatherCache, fetchForecast, getRealWeather, parseOpenMeteo, wmoToIcon } from "./weather";

// 2026-11-21 is a Saturday. 18:00Z = 13:00 Montréal (EST, UTC-5).
const sample = {
  hourly: {
    time: ["2026-11-21T17:00", "2026-11-21T18:00", "2026-11-21T19:00", "2026-11-21T23:00"],
    temperature_2m: [4.26, 5.1, null, 2],
    precipitation_probability: [10, 20, 30, 0],
    weather_code: [0, 3, 61, 71],
  },
};
const ok = (json) => vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));

beforeEach(() => clearWeatherCache());
afterEach(() => vi.restoreAllMocks());

describe("wmoToIcon", () => {
  it.each([
    [0, "sun"], [1, "sun"], [2, "partly"], [3, "cloud"], [45, "fog"], [51, "rain"], [63, "rain"],
    [66, "rain"], [81, "rain"], [71, "snow"], [86, "snow"], [95, "storm"], [99, "storm"],
  ])("code %i -> %s", (code, icon) => expect(wmoToIcon(code)).toBe(icon));
});

describe("parseOpenMeteo", () => {
  it("returns valid HourlyWeather in ISO UTC and skips hours with nulls", () => {
    const hours = parseOpenMeteo(sample);
    expect(() => z.array(HourlyWeather).parse(hours)).not.toThrow();
    expect(hours.map((h) => h.time)).toEqual(["2026-11-21T17:00:00.000Z", "2026-11-21T18:00:00.000Z", "2026-11-21T23:00:00.000Z"]);
    expect(hours[0]).toMatchObject({ tempC: 4.3, rainProb: 10, icon: "sun" });
    expect(hours[2].icon).toBe("snow");
  });
  it("throws on an unexpected response", () => expect(() => parseOpenMeteo({ error: true })).toThrow());
});

describe("applyRainySaturday", () => {
  it("only rains Saturday 13:00–18:00 Montréal time", () => {
    const out = applyRainySaturday(parseOpenMeteo(sample));
    expect(out[0].icon).toBe("sun"); // 12:00 local
    expect(out[1]).toMatchObject({ rainProb: 85, icon: "rain", weatherCode: 63 }); // 13:00 local
    expect(out[2].icon).toBe("snow"); // 23:00Z = 18:00 local: window is end-exclusive, keeps its own weather
  });
});

describe("fetchForecast / getRealWeather", () => {
  it("caches for 30 minutes", async () => {
    const fetchImpl = ok(sample);
    await fetchForecast({ fetchImpl, now: 0 });
    await fetchForecast({ fetchImpl, now: 29 * 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await fetchForecast({ fetchImpl, now: 31 * 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to the mock forecast when Open-Meteo fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await fetchForecast({ fetchImpl: vi.fn(async () => new Response("down", { status: 503 })) });
    expect(res.source).toBe("mock-fallback");
    expect(res.hours.length).toBeGreaterThan(100);
  });

  it("filters to the range and applies the override when asked", async () => {
    const range = { start: "2026-11-21T17:30:00.000Z", end: "2026-11-21T19:00:00.000Z" };
    const plain = await getRealWeather(range, { fetchImpl: ok(sample), forceRainSat: false });
    expect(plain.map((h) => h.time)).toEqual(["2026-11-21T17:00:00.000Z", "2026-11-21T18:00:00.000Z"]);
    expect(plain[1].icon).toBe("cloud");
    clearWeatherCache();
    const rainy = await getRealWeather(range, { fetchImpl: ok(sample), forceRainSat: true });
    expect(rainy[1].icon).toBe("rain");
  });
});
