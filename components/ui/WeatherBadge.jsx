/**
 * Weather for a slot: cel-filled icon + temperature, plus rain chance when it matters (≥ 30%).
 * Takes the FeedCard `weather` fields directly: <WeatherBadge {...card.weather} />.
 */
import { Icon } from "./Icon";
import { cn } from "./classes";

/** @type {Record<import("zod").infer<typeof import("@/types/domain").WeatherIcon>, string>} */
const LABELS = {
  sun: "Sunny",
  partly: "Partly cloudy",
  cloud: "Cloudy",
  rain: "Rain",
  snow: "Snow",
  storm: "Thunderstorms",
  fog: "Fog",
};

/** Show the rain chance from this probability (0–100) upward. */
const RAIN_THRESHOLD = 30;

/**
 * @param {{
 *   icon: keyof typeof LABELS,
 *   tempC: number,
 *   rainProb: number,
 *   variant?: "glass" | "solid",
 *   className?: string,
 * }} props
 * `variant`: "glass" on photos (feed card), "solid" on app surfaces (plan screen).
 */
export function WeatherBadge({ icon, tempC, rainProb, variant = "glass", className }) {
  const temp = Math.round(tempC);
  const showRain = rainProb >= RAIN_THRESHOLD;

  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums",
        variant === "glass" ? "glass-photo text-white" : "border-[1.5px] border-line bg-surface text-ink",
        className,
      )}
    >
      <Icon name={icon} cel strokeWidth={1.9} className="size-[18px]" />
      <span aria-hidden="true">{temp}°</span>
      {showRain && (
        <span aria-hidden="true" className="inline-flex items-center gap-0.5">
          <Icon name="droplet" cel strokeWidth={1.9} className="size-3.5" />
          {rainProb}%
        </span>
      )}
      <span className="sr-only">
        {LABELS[icon]}, {temp}°C, {rainProb}% chance of rain
      </span>
    </span>
  );
}
