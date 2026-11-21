"use client";
/**
 * Place details (tap the category chip on a feed card). Owner: Oscar. DEMO built only on data we already have;
 * every section renders only when its data exists:
 *  - card: photo, category, price, tags, address, coords, slot, travel times
 *  - data/places.json (Adel's dataset, loaded on demand): opening hours per weekday, indoor/outdoor, visit length.
 *    Used only when the card's place id AND name match, so a mock/real id clash can never show wrong hours.
 *  - Open-Meteo (free, no key, called from the browser with the place's public coordinates): hourly rain %,
 *    temperature and humidity around the visit. NOTE: live data, so it ignores the server's FORCE_RAIN_SAT demo
 *    override; the card's badge (engine weather) can differ on the staged rainy Saturday.
 */
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { formatSlot, minutesBetween, toLocal, weekdayKey } from "@/lib/time";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { buttonClasses } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { PriceLevel } from "@/components/ui/PriceLevel";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/classes";
import { INTERESTS } from "@/components/onboarding/options";
import { CATEGORY_LABELS } from "./FeedCard";

const TAG_LABELS = new Map(INTERESTS.map((t) => [t.id, t.label]));
const WEEK = /** @type {const} */ (["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
/** Hours of forecast shown before and after the visit. */
const PAD_HOURS = 3;

/** @typedef {{ open: string, close: string }} Interval */
/** @typedef {{ hours: Partial<Record<(typeof WEEK)[number], Interval[]>>, indoor: boolean, typicalDurationMin: number }} PlaceExtras */
/** @typedef {{ time: string, rain: number | null, temp: number | null, humidity: number | null }} ForecastHour */

/**
 * Opening hours etc. from data/places.json, lazy-loaded the first time a sheet opens.
 * undefined = loading, null = not in the dataset.
 * @param {string} id @param {string} name
 */
function usePlaceExtras(id, name) {
  const [extras, setExtras] = useState(/** @type {PlaceExtras | null | undefined} */ (undefined));
  useEffect(() => {
    let alive = true;
    import("@/data/places.json")
      .then((m) => {
        const list = /** @type {Array<PlaceExtras & { id: string, name: string }>} */ (m.default);
        const p = list.find((x) => x.id === id && x.name === name);
        if (alive) setExtras(p ? { hours: p.hours, indoor: p.indoor, typicalDurationMin: p.typicalDurationMin } : null);
      })
      .catch((e) => {
        console.warn("[place] places.json", e);
        if (alive) setExtras(null);
      });
    return () => {
      alive = false;
    };
  }, [id, name]);
  return extras;
}

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

/** "07:00" → "7 AM", "19:30" → "7:30 PM". */
function clock(/** @type {string} */ hhmm) {
  const t = DateTime.fromFormat(hhmm, "HH:mm");
  return t.minute ? t.toFormat("h:mm a") : t.toFormat("h a");
}

/** "7 AM–11 PM" (close before open = after midnight). */
function intervalText(/** @type {Interval} */ iv) {
  return `${clock(iv.open)}–${clock(iv.close)}${iv.close <= iv.open ? " (next day)" : ""}`;
}

/** Is the whole visit inside one of the day's opening intervals? */
function openForVisit(/** @type {Interval[]} */ intervals, /** @type {string} */ startIso, /** @type {string} */ endIso) {
  const s = toLocal(startIso);
  const e = toLocal(endIso);
  return intervals.some((iv) => {
    const [oh, om] = iv.open.split(":").map(Number);
    const [ch, cm] = iv.close.split(":").map(Number);
    const open = s.set({ hour: oh, minute: om, second: 0, millisecond: 0 });
    let close = s.set({ hour: ch, minute: cm, second: 0, millisecond: 0 });
    if (close <= open) close = close.plus({ days: 1 });
    return open <= s && e <= close;
  });
}

/** "1 h", "1 h 30", "45 min". */
function duration(/** @type {number} */ min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/**
 * @param {{ card: import("@/types/feed").FeedCardT | null, onClose: () => void }} props
 * Open while `card` is set.
 */
export function PlaceSheet({ card, onClose }) {
  if (!card) return null;
  return <PlaceSheetBody card={card} onClose={onClose} />;
}

/** @param {{ card: import("@/types/feed").FeedCardT, onClose: () => void }} props */
function PlaceSheetBody({ card, onClose }) {
  const { place, slot, friends, myTravelMin } = card;
  const extras = usePlaceExtras(place.id, place.name);
  const forecast = useForecast(place.lat, place.lng, slot.start, slot.end);
  const day = weekdayKey(toLocal(slot.start));
  const todays = extras?.hours[day] ?? [];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  /** Not in the contract yet (place descriptions are pending): shows once the field arrives. */
  const description = /** @type {{ description?: string }} */ (place).description;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={place.name}
      description={
        <span className="inline-flex flex-wrap items-center gap-x-2">
          {CATEGORY_LABELS[place.category] ?? place.category}
          <span aria-hidden="true">·</span>
          <PriceLevel level={place.priceLevel} className="text-ink" />
          {extras && (
            <>
              <span aria-hidden="true">·</span>
              {extras.indoor ? "Indoors" : "Outdoors"}
            </>
          )}
        </span>
      }
    >
      <div className="space-y-5 pb-4">
        {/* Photo + what it is */}
        <div className="space-y-3">
          <div className="h-36 overflow-hidden rounded-tile border-[1.5px] border-line bg-raised">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote place photos */}
            <img src={place.photoUrl} alt="" className="size-full object-cover" />
          </div>
          {description && <p className="leading-snug">{description}</p>}
          {place.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Known for">
              {place.tags.map((t) => (
                <Chip key={t}>{TAG_LABELS.get(t) ?? t.replace(/-/g, " ")}</Chip>
              ))}
            </div>
          )}
        </div>

        {/* Your visit + opening hours */}
        <Section title="Your visit" icon="clock">
          <p className="font-bold tabular-nums">{formatSlot(slot.start, slot.end)}</p>
          <p className="text-sm text-ink-muted">
            About {duration(minutesBetween(slot.start, slot.end))} there
            {extras && extras.typicalDurationMin !== minutesBetween(slot.start, slot.end) && ` (people usually stay ${duration(extras.typicalDurationMin)})`}
          </p>
          {extras === undefined && <Skeleton className="mt-2 h-24 rounded-xl" />}
          {extras && (
            <>
              {todays.length > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-line bg-teal px-3 py-1 text-sm font-bold text-on-teal">
                  {openForVisit(todays, slot.start, slot.end) && <Icon name="check" strokeWidth={3} className="size-4" />}
                  Open {todays.map(intervalText).join(", ")}
                  {openForVisit(todays, slot.start, slot.end) ? " · your whole visit" : ""}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {WEEK.map((d) => {
                  const iv = extras.hours[d] ?? [];
                  const isDay = d === day;
                  return (
                    <div key={d} className={cn("contents", isDay ? "font-bold text-ink" : "text-ink-muted")}>
                      <dt>{DAY_NAMES[d]}{isDay && <span className="sr-only"> (your visit)</span>}</dt>
                      <dd className="tabular-nums">{iv.length ? iv.map(intervalText).join(", ") : "Closed"}</dd>
                    </div>
                  );
                })}
              </dl>
            </>
          )}
        </Section>

        {/* Weather around the visit */}
        {forecast !== null && (
          <Section title="Weather around your visit" icon="droplet">
            {forecast === undefined ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : (
              <WeatherChart hours={forecast} slotStart={slot.start} slotEnd={slot.end} cardRain={card.weather.rainProb} />
            )}
          </Section>
        )}

        {/* Getting there */}
        <Section title="Getting there" icon="pin">
          <p className="text-sm">{place.address}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex justify-between gap-3">
              <span className="font-semibold">You</span>
              <span className="tabular-nums">{myTravelMin} min</span>
            </li>
            {friends.map((f) => (
              <li key={f.id} className="flex justify-between gap-3 text-ink-muted">
                <span>{f.name}</span>
                <span className="tabular-nums">
                  {f.travelIsEstimate ? "~" : ""}
                  {f.travelMin} min
                </span>
              </li>
            ))}
          </ul>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "secondary", fullWidth: true, className: "mt-3" })}
          >
            <Icon name="pin" cel strokeWidth={1.9} className="size-4" />
            Open in Maps
          </a>
        </Section>
      </div>
    </BottomSheet>
  );
}

/** @param {{ title: string, icon: import("@/components/ui/Icon").IconName, children: React.ReactNode }} props */
function Section({ title, icon, children }) {
  return (
    <section className="cel rounded-tile p-3.5">
      <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold">
        <Icon name={icon} cel strokeWidth={1.9} className="size-5" />
        {title}
      </h3>
      {children}
    </section>
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
