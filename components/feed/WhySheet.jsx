"use client";
/**
 * "Why am I seeing this?" (PLAN.md F4). Owner: Oscar.
 * The card's score breakdown in plain English, biggest reason first. Each row: label, a one-line reason
 * built from the card itself, a bar for how well that part scored (0–1), and the points it added
 * (weight × score). The points add up to the match %. Meant to be read by a judge in 3 seconds.
 * Above it, "About": the place's description (when the data has one) + category, price, visit length, address.
 */
import { SCORE_WEIGHTS } from "@/lib/engine/config";
import { minutesBetween } from "@/lib/time";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { PriceLevel } from "@/components/ui/PriceLevel";
import { cn } from "@/components/ui/classes";
import { INTERESTS } from "@/components/onboarding/options";
import { CATEGORY_LABELS } from "./FeedCard";

/** Friendly tag names ("cheap-eats" → "Cheap eats"), shared with onboarding. */
const TAG_LABELS = new Map(INTERESTS.map((t) => [t.id, t.label]));

const listFormat = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

const WEATHER_WORDS = {
  sun: "Sunny",
  partly: "Partly cloudy",
  cloud: "Cloudy",
  rain: "Rainy",
  snow: "Snowy",
  storm: "Stormy",
  fog: "Foggy",
};

/**
 * Label + a short reason for each breakdown part, written from the card's own data.
 * @param {import("@/types/feed").FeedCardT} card
 * @returns {Record<keyof import("@/types/feed").ScoreBreakdownT, { label: string, reason: string }>}
 */
function explain(card) {
  const names = card.friends.map((f) => f.name);
  const maxTravel = Math.max(card.myTravelMin, ...card.friends.map((f) => f.travelMin));
  const tags = card.place.tags
    .slice(0, 2)
    .map((t) => TAG_LABELS.get(t)?.toLowerCase() ?? t.replace(/-/g, " "))
    .join(", ");
  return {
    interest: { label: "Interest match", reason: tags ? `You like ${tags}` : "Fits what you like" },
    friends: {
      label: "Friends free",
      reason: names.length ? `${listFormat.format(names)} ${names.length === 1 ? "is" : "are"} free` : "Nobody else is free",
    },
    timing: { label: "Good timing", reason: "A good time of day for this kind of place" },
    weather: {
      label: "Weather",
      reason:
        // The engine drops outdoor places when rain is likely, so a good weather score in the rain = indoors.
        card.weather.rainProb >= 30 && card.breakdown.weather >= 0.7
          ? `${WEATHER_WORDS[card.weather.icon] ?? "Wet"} out, but this one's indoors`
          : `${WEATHER_WORDS[card.weather.icon] ?? "Weather"}, ${Math.round(card.weather.tempC)}°${
              card.weather.rainProb >= 30 ? `, ${card.weather.rainProb}% rain` : ""
            }`,
    },
    fairness: { label: "Fair for everyone", reason: `Nobody travels more than ${maxTravel} min` },
    novelty: { label: "Something new", reason: "You haven't been shown it lately" },
    proximity: { label: "Close to you", reason: `${card.myTravelMin} min from you` },
  };
}

/** "1 h", "1 h 30", "45 min" from the slot (the engine trims slots to the place's typical visit length). */
function visitLength(/** @type {import("@/types/feed").FeedCardT} */ card) {
  const min = minutesBetween(card.slot.start, card.slot.end);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/**
 * What the place is: Adel's one-line description (once `place.description` is in the FeedCard contract),
 * plus the facts the card already carries.
 * @param {{ card: import("@/types/feed").FeedCardT }} props
 */
function AboutPlace({ card }) {
  const { place } = card;
  /** Not in the contract yet: undefined until the description field lands (the feed strips unknown keys). */
  const description = /** @type {{ description?: string }} */ (place).description;
  return (
    <section aria-label={`About ${place.name}`} className="cel mb-4 space-y-2 rounded-tile p-3.5">
      {description && <p className="leading-snug">{description}</p>}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink-muted">
        <span className="text-ink">{CATEGORY_LABELS[place.category] ?? place.category}</span>
        <span aria-hidden="true">·</span>
        <PriceLevel level={place.priceLevel} className="text-ink" />
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <Icon name="clock" cel strokeWidth={1.9} className="size-4" />
          about {visitLength(card)}
        </span>
      </p>
      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        <Icon name="pin" cel strokeWidth={1.9} className="size-4" />
        {place.address}
      </p>
    </section>
  );
}

/**
 * @param {{ card: import("@/types/feed").FeedCardT | null, onClose: () => void }} props
 * Open while `card` is set.
 */
export function WhySheet({ card, onClose }) {
  if (!card) return null;
  const text = explain(card);
  const rows = /** @type {(keyof typeof SCORE_WEIGHTS)[]} */ (Object.keys(SCORE_WEIGHTS))
    .map((key) => {
      const value = Math.max(0, Math.min(1, card.breakdown[key] ?? 0));
      return { key, value, points: Math.round(SCORE_WEIGHTS[key] * value * 100), ...text[key] };
    })
    .sort((a, b) => b.points - a.points);
  const match = Math.round(Math.max(0, Math.min(1, card.score)) * 100);

  return (
    <BottomSheet open onClose={onClose} title="Why this card?" description={card.place.name}>
      <AboutPlace card={card} />

      <div className="flex items-baseline gap-2 pb-4">
        <span className="font-display text-title font-extrabold tabular-nums">{match}%</span>
        <span className="font-semibold text-ink-muted">match for you</span>
      </div>

      <ul className="space-y-3.5 pb-4">
        {rows.map((r, i) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-bold">
                {r.label}
                {i === 0 && (
                  <span className="ml-2 inline-flex h-5 items-center rounded-full border-[1.5px] border-line bg-teal px-2 align-middle text-micro font-bold text-on-teal">
                    Top reason
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums">+{r.points}</span>
            </div>
            <p className="text-sm text-ink-muted">{r.reason}</p>
            <div
              role="meter"
              aria-label={`${r.label} score`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(r.value * 100)}
              className="mt-1.5 h-2.5 overflow-hidden rounded-full border-[1.5px] border-line bg-raised"
            >
              <div
                className={cn("h-full rounded-full", i < 3 ? "bg-ink" : "bg-teal")}
                style={{ width: `${Math.round(r.value * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="pb-2 text-xs text-ink-muted">
        Points = how well it scores × how much that part counts. Together they make the match %.
      </p>
    </BottomSheet>
  );
}
