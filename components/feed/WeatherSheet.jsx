"use client";
/**
 * Weather for a card's visit (tap the weather badge on a feed card). Owner: Oscar.
 *  - Top: what the card plans with (the engine's forecast for the slot: icon, temperature, rain %).
 *  - Chart: hourly rain % (bars), temperature (line) and humidity (dashed) from 3 h before to after the visit,
 *    live from Open-Meteo (free, no key, called from the browser with the place's public coordinates).
 *    Shown only when the forecast is available. NOTE: live data ignores the server's FORCE_RAIN_SAT demo override,
 *    so on the staged rainy Saturday it can disagree with the card; a "Heads-up" line says so.
 */
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { formatSlot, toLocal } from "@/lib/time";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/classes";

/** Hours of forecast shown before and after the visit. */
const PAD_HOURS = 3;

/** @typedef {{ time: string, rain: number | null, temp: number | null, humidity: number | null }} ForecastHour */

const WEATHER_WORDS = { sun: "Sunny", partly: "Partly cloudy", cloud: "Cloudy", rain: "Rain", snow: "Snow", storm: "Thunderstorms", fog: "Fog" };

/**
 * Hourly forecast around the visit from Open-Meteo. undefined = loading, null = unavailable (offline, too far ahead…).
 * @param {number} lat @param {number} lng @param {string} startIso @param {string} endIso
 */
function useForecast(lat, lng, startIso, endIso) {
  const [hours, setHours] = useState(/** @type {ForecastHour[] | null | undefined} */ (undefined));
  useEffect(() => {
    const ctrl = new AbortController();
    const from = DateTime.fromISO(startIso, { zone: "utc" }).startOf("hour").minus({ hours: PAD_HOURS });
    const to = DateTime.fromISO(endIso, { zone: "utc" }).plus({ hours: PAD_HOURS }).startOf("hour");
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      "&hourly=temperature_2m,precipitation_probability,relative_humidity_2m&timezone=UTC" +
      `&start_date=${from.toISODate()}&end_date=${to.toISODate()}`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`open-meteo ${r.status}`))))
      .then((j) => {
        const h = j?.hourly;
        if (!h || !Array.isArray(h.time)) throw new Error("no hourly data");
        /** @type {ForecastHour[]} */
        const rows = [];
        h.time.forEach((/** @type {string} */ t, /** @type {number} */ i) => {
          const dt = DateTime.fromISO(t, { zone: "utc" });
          if (dt < from || dt > to) return;
          const num = (/** @type {unknown[] | undefined} */ arr) => (typeof arr?.[i] === "number" ? /** @type {number} */ (arr[i]) : null);
          rows.push({ time: dt.toISO() ?? t, rain: num(h.precipitation_probability), temp: num(h.temperature_2m), humidity: num(h.relative_humidity_2m) });
        });
        setHours(rows.some((r) => r.rain !== null || r.temp !== null) ? rows : null);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.warn("[place] forecast", e);
        setHours(null);
      });
    return () => ctrl.abort();
  }, [lat, lng, startIso, endIso]);
  return hours;
}


/**
 * @param {{ card: import("@/types/feed").FeedCardT | null, onClose: () => void }} props
 * Open while `card` is set.
 */
export function WeatherSheet({ card, onClose }) {
  if (!card) return null;
  return <WeatherSheetBody card={card} onClose={onClose} />;
}

/** @param {{ card: import("@/types/feed").FeedCardT, onClose: () => void }} props */
function WeatherSheetBody({ card, onClose }) {
  const { place, slot, weather } = card;
  const forecast = useForecast(place.lat, place.lng, slot.start, slot.end);
  return (
    <BottomSheet open onClose={onClose} title="Weather" description={`${place.name} · ${formatSlot(slot.start, slot.end)}`}>
      <div className="space-y-4 pb-4">
        {/* What the card plans with */}
        <div className="cel flex items-center gap-4 rounded-tile p-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-surface">
            <Icon name={weather.icon} cel strokeWidth={1.7} className="size-10" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-heading font-extrabold tabular-nums">{Math.round(weather.tempC)}°C</p>
            <p className="mt-1 font-semibold">{WEATHER_WORDS[weather.icon] ?? "Weather"}</p>
            <p className="text-sm text-ink-muted">
              {weather.rainProb < 5 ? "No rain expected" : `${weather.rainProb}% chance of rain`} for your visit
            </p>
          </div>
        </div>

        {/* Hour by hour */}
        {forecast !== null && (
          <section className="cel rounded-tile p-3.5" aria-labelledby="hourly-weather">
            <h3 id="hourly-weather" className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold">
              <Icon name="droplet" cel strokeWidth={1.9} className="size-5" />
              Hour by hour
            </h3>
            {forecast === undefined ? (
              <Skeleton className="h-40 rounded-tile" />
            ) : (
              <WeatherChart hours={forecast} slotStart={slot.start} slotEnd={slot.end} cardRain={weather.rainProb} />
            )}
          </section>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * Hourly rain % (bars), temperature (line) and humidity (dashed line), the visit highlighted.
 * @param {{ hours: ForecastHour[], slotStart: string, slotEnd: string, cardRain: number }} props
 * `cardRain`: the rain % on the card (the engine's forecast, which includes the staged-rain demo override).
 */
function WeatherChart({ hours, slotStart, slotEnd, cardRain }) {
  const W = 320;
  const H = 150;
  const top = 18;
  const bottom = H - 20;
  const area = bottom - top;
  const n = hours.length;
  const col = W / n;
  const s = Date.parse(slotStart);
  const e = Date.parse(slotEnd);
  const inVisit = (/** @type {ForecastHour} */ h) => Date.parse(h.time) + 3600_000 > s && Date.parse(h.time) < e;

  const temps = hours.map((h) => h.temp).filter((t) => t !== null);
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  // Temperature uses the upper part of the chart, centred, at least 4° tall so small changes don't look dramatic.
  const tSpan = Math.max(4, tMax - tMin);
  const tLow = (tMin + tMax) / 2 - tSpan / 2;
  const tY = (/** @type {number} */ t) => top + 10 + (1 - (t - tLow) / tSpan) * (area * 0.55);
  const pct = (/** @type {number} */ v) => bottom - (v / 100) * area;
  const line = (/** @type {(h: ForecastHour) => number | null} */ get, /** @type {(v: number) => number} */ y) =>
    hours
      .map((h, i) => [i, get(h)])
      .filter(([, v]) => v !== null)
      .map(([i, v], k) => `${k ? "L" : "M"}${(Number(i) * col + col / 2).toFixed(1)} ${y(Number(v)).toFixed(1)}`)
      .join(" ");

  const visit = hours.filter(inVisit);
  const first = hours.findIndex(inVisit);
  const range = (/** @type {(number | null)[]} */ vals) => {
    const v = vals.filter((x) => x !== null);
    return v.length ? [Math.round(Math.min(...v)), Math.round(Math.max(...v))] : null;
  };
  const rainR = range(visit.map((h) => h.rain));
  const tempR = range(visit.map((h) => h.temp));
  const humR = range(visit.map((h) => h.humidity));
  const hasHumidity = hours.some((h) => h.humidity !== null);
  const span = (/** @type {number[]} */ r, /** @type {string} */ unit) => (r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`);
  const summary = [
    rainR && (rainR[1] < 5 ? "no rain expected" : `rain chance up to ${rainR[1]}%`),
    tempR && span(tempR, "°C"),
    humR && `humidity ${span(humR, "%")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`During your visit: ${summary}.`}>
        {/* visit band */}
        {first >= 0 && (
          <g>
            <rect x={first * col} y={2} width={visit.length * col} height={bottom - 2} rx={8} className="fill-accent/12" />
            <text x={first * col + (visit.length * col) / 2} y={13} textAnchor="middle" className="fill-ink text-[10px] font-bold">
              Your visit
            </text>
          </g>
        )}
        {/* baseline */}
        <line x1={0} x2={W} y1={bottom} y2={bottom} className="stroke-line/25" strokeWidth={1} />
        {/* rain bars */}
        {hours.map((h, i) =>
          h.rain === null ? null : (
            <rect
              key={h.time}
              x={i * col + col * 0.22}
              width={col * 0.56}
              y={pct(h.rain)}
              height={Math.max(1.5, bottom - pct(h.rain))}
              rx={3}
              className={cn("fill-teal", inVisit(h) ? "opacity-100" : "opacity-50")}
            />
          ),
        )}
        {/* humidity (dashed) */}
        {hasHumidity && <path d={line((h) => h.humidity, pct)} fill="none" strokeWidth={1.6} strokeDasharray="4 3" className="stroke-ink-muted" />}
        {/* temperature */}
        {temps.length > 0 && (
          <>
            <path d={line((h) => h.temp, tY)} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-accent" />
            {hours.map((h, i) =>
              h.temp === null ? null : (
                <g key={`t${h.time}`}>
                  <circle cx={i * col + col / 2} cy={tY(h.temp)} r={2.8} className="fill-accent" />
                  {i % 2 === 0 && (
                    <text x={i * col + col / 2} y={tY(h.temp) - 6} textAnchor="middle" className="fill-ink text-[9px] font-bold">
                      {Math.round(h.temp)}°
                    </text>
                  )}
                </g>
              ),
            )}
          </>
        )}
        {/* hour labels */}
        {hours.map((h, i) =>
          i % 2 === 0 ? (
            <text key={`x${h.time}`} x={i * col + col / 2} y={H - 6} textAnchor="middle" className="fill-ink-muted text-[9px]">
              {toLocal(h.time).toFormat("ha").toLowerCase()}
            </text>
          ) : null,
        )}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-teal" /> Rain chance
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-accent" /> Temperature
        </span>
        {hasHumidity && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 border-t-[1.6px] border-dashed border-ink-muted" /> Humidity
          </span>
        )}
      </div>
      {summary && <p className="text-sm font-semibold">During your visit: {summary}</p>}
      {rainR && Math.abs(cardRain - rainR[1]) >= 40 && (
        <p className="text-xs font-semibold text-ink">
          Heads-up: the card plans with {cardRain}% rain for this slot; the live forecast now says {rainR[1]}%.
        </p>
      )}
      <p className="text-xs text-ink-muted">Live forecast for this spot · Open-Meteo</p>
    </div>
  );
}
