"use client";
/**
 * One feed suggestion (PLAN.md F2). Owner: Oscar.
 * Full-height photo island: what (name, category, price) · when (slot) · who (free friends + travel),
 * weather, caption, and the Skip / Save / Let's go actions.
 * Presentational: the parent (the feed screen) owns saved state and what each action does.
 */
import { Fragment, useState } from "react";
import { formatSlot } from "@/lib/time";
import { AvatarStack } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { SwipeToGo } from "@/components/ui/SwipeToGo";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { PriceLevel } from "@/components/ui/PriceLevel";
import { WeatherBadge } from "@/components/ui/WeatherBadge";
import { cn, focusRing, pressable } from "@/components/ui/classes";

/** @type {Record<import("@/types/domain").CategoryT, string>} */
export const CATEGORY_LABELS = {
  cafe: "Café",
  restaurant: "Restaurant",
  bar: "Bar",
  park: "Park",
  viewpoint: "Viewpoint",
  activity: "Activity",
  event: "Event",
};

/** "12 min", or "~12 min" when the travel time is a haversine estimate. */
function travel(/** @type {number} */ min, /** @type {boolean} */ estimate) {
  return `${estimate ? "~" : ""}${min} min`;
}

/**
 * @param {{
 *   card: import("@/types/feed").FeedCardT,
 *   saved?: boolean,
 *   onSkip?: () => void,
 *   onSave?: () => void,
 *   onGo?: () => void,
 *   onWhy?: () => void,
 *   onDetails?: () => void,
 *   onWeather?: () => void,
 *   priority?: boolean,
 *   leaving?: boolean,
 *   goResetKey?: string | number,
 *   className?: string,
 * }} props
 * `onGo` fires ~700 ms after the swipe bar breaks. Change `goResetKey` to put the bar back.
 * `priority` loads the photo eagerly (first card on screen). `onWhy` hides the info button when missing.
 * `leaving` plays the skip-out animation and blocks further taps (the parent removes the card after it).
 */
export function FeedCard({ card, saved = false, onSkip, onSave, onGo, onWhy, onDetails, onWeather, priority = false, leaving = false, goResetKey = 0, className }) {
  const { place, slot, friends, weather, caption, myTravelMin } = card;
  // N1: registry places (business list) only have assumed hours. Shows once `place.hoursVerified` is in the
  // FeedCard contract (Anthony); until then the feed's contract check strips it and nothing shows.
  const hoursUnverified = /** @type {{ hoursVerified?: boolean }} */ (place).hoursVerified === false;
  const [photoFailed, setPhotoFailed] = useState(false);
  // Bumped on every save so the burst replays (new key = new animation).
  const [burst, setBurst] = useState(0);
  const titleId = `card-${card.id}-title`;

  const handleSave = () => {
    if (!saved) setBurst((n) => n + 1);
    onSave?.();
  };

  return (
    <article
      aria-labelledby={titleId}
      inert={leaving || undefined}
      className={cn(
        "relative isolate h-full overflow-hidden rounded-card border-2 border-line bg-ink shadow-cel",
        leaving && "pointer-events-none motion-safe:animate-skip-out",
        className,
      )}
    >
      {burst > 0 && (
        <span
          key={burst}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 motion-safe:animate-heart-burst"
        >
          <Icon name="heart" cel strokeWidth={1.4} className="size-32 text-white drop-shadow-[0_6px_0_var(--color-shade)]" />
        </span>
      )}
      {!photoFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- remote place photos, no next.config change needed
        <img
          src={place.photoUrl}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable={false}
          onError={() => setPhotoFailed(true)}
          className="absolute inset-0 -z-10 size-full object-cover"
        />
      )}
      {/* Readable text on any photo: dark at the bottom, a light veil at the top for the badges. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/25 to-black/35" />

      <div className="flex h-full flex-col justify-between p-4">
        {/* Top: category + weather, info button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {onDetails ? (
              // Tap the category for the place's details (hours, weather around the visit, map).
              // before: extends the 32px chip to a 44px tap target without changing its look.
              <button
                type="button"
                onClick={onDetails}
                aria-label={`Details about ${place.name}`}
                className={cn("relative rounded-full before:absolute before:-inset-1.5 before:content-['']", pressable, focusRing)}
              >
                <Chip tone="glass" className="h-8 gap-1 px-3 text-sm">
                  {CATEGORY_LABELS[place.category] ?? place.category}
                  <Icon name="info" strokeWidth={2.2} className="size-3.5 opacity-80" />
                </Chip>
              </button>
            ) : (
              <Chip tone="glass" className="h-8 px-3 text-sm">
                {CATEGORY_LABELS[place.category] ?? place.category}
              </Chip>
            )}
            {onWeather ? (
              // Tap the weather for the hour-by-hour chart around the visit (same 44px hit-area trick as the chip).
              <button
                type="button"
                onClick={onWeather}
                aria-label={`Weather for ${place.name}: ${Math.round(weather.tempC)}°C, ${weather.rainProb}% chance of rain. Show hour by hour`}
                className={cn("relative rounded-full before:absolute before:-inset-1.5 before:content-['']", pressable, focusRing)}
              >
                <WeatherBadge {...weather} />
              </button>
            ) : (
              <WeatherBadge {...weather} />
            )}
          </div>
          {onWhy && <IconButton label="Why am I seeing this?" icon={<Icon name="info" />} onClick={onWhy} />}
        </div>

        {/* Bottom: what · when · who, caption, actions */}
        <div className="space-y-3 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-line bg-teal px-3 text-sm font-bold text-on-teal tabular-nums shadow-[0_2px_0_var(--color-shade)]">
              <Icon name="clock" cel strokeWidth={1.9} className="size-[18px]" />
              {formatSlot(slot.start, slot.end)}
            </p>
            {hoursUnverified && <HoursNotVerified />}
          </div>

          <div>
            <h2 id={titleId} className="ink-pop line-clamp-2 font-display text-heading font-extrabold break-words">
              {place.name}
            </h2>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-white/85">
              <PriceLevel level={place.priceLevel} />
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Icon name="walk" strokeWidth={1.9} className="size-4" />
                You {myTravelMin} min
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {friends.length > 0 ? (
              <>
                <AvatarStack people={friends} size="sm" tone="photo" />
                {/* Each "Name 12 min" stays together; the line wraps between friends, never mid-name. */}
                <p className="min-w-0 text-sm leading-snug font-semibold text-white/90">
                  {friends.map((f, i) => (
                    <Fragment key={f.id}>
                      {i > 0 && <span aria-hidden="true"> · </span>}
                      <span className="whitespace-nowrap">
                        {f.name} {travel(f.travelMin, f.travelIsEstimate)}
                      </span>
                    </Fragment>
                  ))}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-white/90">Just you this time</p>
            )}
          </div>

          <p className="line-clamp-2 text-[15px] leading-snug text-white/90">{caption}</p>

          <div className="flex items-center gap-3 pt-1">
            <IconButton label={`Skip ${place.name}`} icon={<Icon name="x" strokeWidth={2.5} />} size="lg" onClick={onSkip} />
            <IconButton
              label={saved ? `Unsave ${place.name}` : `Save ${place.name}`}
              size="lg"
              pressed={saved}
              onClick={handleSave}
              icon={
                <span key={saved ? "on" : "off"} className={saved ? "motion-safe:animate-pop" : undefined}>
                  <Icon name="heart" filled={saved} className={saved ? "text-love" : undefined} />
                </span>
              }
            />
            <SwipeToGo
              className="min-w-0 flex-1"
              onGo={onGo}
              resetKey={goResetKey}
              disabled={leaving}
              ariaLabel={`Let's go to ${place.name}: swipe right or press Enter`}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

/** N1 badge: amber cel pill, readable on any photo. Also used in the place details sheet. */
export function HoursNotVerified() {
  return (
    <p className="inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-line bg-warning px-3 text-xs font-bold text-on-accent">
      <Icon name="info" strokeWidth={2.2} className="size-4" />
      Hours not verified · call ahead
    </p>
  );
}

/**
 * Same footprint as a FeedCard, for the loading state. Pair with one sr-only "Loading…".
 * @param {{ className?: string }} props
 */
export function FeedCardSkeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative h-full overflow-hidden rounded-card border-[1.5px] border-line bg-raised shadow-cel", className)}
    >
      <div className="flex h-full flex-col justify-between p-4 motion-safe:animate-pulse">
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-full bg-surface/60" />
          <div className="h-8 w-16 rounded-full bg-surface/60" />
        </div>
        <div className="space-y-3">
          <div className="h-8 w-40 rounded-full bg-surface/60" />
          <div className="h-9 w-3/4 rounded-button bg-surface/60" />
          <div className="h-4 w-1/2 rounded-full bg-surface/60" />
          <div className="h-4 w-full rounded-full bg-surface/60" />
          <div className="flex gap-3 pt-1">
            <div className="size-14 rounded-full bg-surface/60" />
            <div className="size-14 rounded-full bg-surface/60" />
            <div className="h-14 flex-1 rounded-button bg-surface/60" />
          </div>
        </div>
      </div>
    </div>
  );
}
