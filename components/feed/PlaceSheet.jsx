"use client";
/**
 * Place details (tap the category chip on a feed card). Owner: Oscar. DEMO built only on data we already have;
 * every section renders only when its data exists. (The hourly weather chart lives in WeatherSheet: tap the weather badge.)
 *  - card: photo, category, price, tags, address, coords, slot, travel times
 *  - data/places.json (Adel's dataset, loaded on demand): opening hours per weekday, indoor/outdoor, visit length.
 *    Used only when the card's place id AND name match, so a mock/real id clash can never show wrong hours.
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

/** @typedef {{ open: string, close: string }} Interval */
/** @typedef {{ hours: Partial<Record<(typeof WEEK)[number], Interval[]>>, indoor: boolean, typicalDurationMin: number }} PlaceExtras */

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

