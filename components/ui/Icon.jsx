/**
 * Inline SVG icons (24×24, stroke = currentColor). No icon package, so nothing to install.
 * Icons are decorative (aria-hidden). The control that holds them gets the label.
 *
 * `cel` turns on the demo's cel-pop style: the outline stays currentColor and the main shapes get
 * a flat brand fill (sun = orange, raindrop = teal, cloud = paper...). Weather icons use it by default
 * through WeatherBadge; pass it yourself for pins, clocks or the heart.
 */
import { cn } from "./classes";

/** Fill keys → Tailwind fill classes. Only used when `cel` is on. */
const FILLS = {
  accent: "fill-accent",
  teal: "fill-teal",
  peach: "fill-peach",
  paper: "fill-[#faf6f0]",
};

/** @typedef {{ d: string, f?: keyof typeof FILLS }} Shape */

/** Base cloud, reused (shifted up) by rain / snow / storm. */
const cloud = "M7 19a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5a4.5 4.5 0 0 1 .5 9.5z";
const cloudUp = "M7 16a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6.5a4.5 4.5 0 0 1 .5 9.5z";
const circle9 = "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z";

/** @type {Record<string, Shape[]>} */
const SHAPES = {
  x: [{ d: "M18 6 6 18M6 6l12 12" }],
  heart: [{ d: "M12 20.5s-8.5-4.9-8.5-11A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8.5 2.9c0 6.1-8.5 11-8.5 11z", f: "accent" }],
  arrowRight: [{ d: "M5 12h14M13 6l6 6-6 6" }],
  arrowDown: [{ d: "M12 4v16M6 14l6 6 6-6" }],
  back: [{ d: "M15 5l-7 7 7 7" }],
  check: [{ d: "M5 12.5l4.5 4.5L19 7.5" }],
  plus: [{ d: "M12 5v14M5 12h14" }],
  /** Feed tab: a compass (discover). */
  compass: [
    { d: circle9, f: "paper" },
    { d: "M15.5 8.5l-2 5-5 2 2-5z", f: "accent" },
  ],
  /** You tab: a person. */
  user: [
    { d: "M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8z", f: "teal" },
    { d: "M4.5 20.5c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2" },
  ],
  calendar: [
    { d: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", f: "paper" },
    { d: "M4 10h16M8 3v4M16 3v4" },
  ],
  refresh: [{ d: "M20.5 12a8.5 8.5 0 1 1-2.6-6.1L20.5 8.5" }, { d: "M20.5 3.5v5h-5" }],
  info: [{ d: circle9, f: "teal" }, { d: "M12 11v5M12 8h.01" }],
  clock: [{ d: circle9, f: "teal" }, { d: "M12 7v5l3 2" }],
  pin: [
    { d: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z", f: "teal" },
    { d: "M12 12a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5z", f: "accent" },
  ],
  walk: [
    { d: "M3 17.6c0-1 .6-1.6 1.5-1.6h3l2.1-5 3.4 1.5c1.8.8 3 2.5 5.4 3 1.6.3 2.6 1.2 2.6 2.4V19H3z", f: "teal" },
    { d: "M9.7 13.1l1.5.6M8.9 15l1.5.6M2 8.5h3.5M3 11.5h2.5" },
  ],
  friends: [
    { d: "M9 12.5a4 4 0 1 0 0-8a4 4 0 1 0 0 8z", f: "teal" },
    { d: "M2.5 21c.6-3.8 3.2-6 6.5-6 1.6 0 3 .5 4.2 1.4" },
    { d: "M16 15a3.3 3.3 0 1 0 0-6.6a3.3 3.3 0 1 0 0 6.6zM12.6 21c.5-2.6 1.7-4.2 3.4-4.2s3 1.6 3.4 4.2" },
  ],
  droplet: [{ d: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z", f: "teal" }],
  sun: [
    { d: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", f: "accent" },
    { d: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" },
  ],
  partly: [
    { d: "M8.5 1.5v1.5M3.6 3.6l1.06 1.06M1.5 8.5H3M13.4 3.6l-1.06 1.06" },
    { d: "M8.5 4.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", f: "accent" },
    { d: "M9 20a3.5 3.5 0 0 1-.5-6.96A4.8 4.8 0 0 1 17.6 12a4 4 0 0 1 .4 8z", f: "paper" },
  ],
  cloud: [{ d: cloud, f: "paper" }],
  rain: [{ d: cloudUp, f: "paper" }, { d: "M8 18.5l-1 2.5M12 18.5l-1 2.5M16 18.5l-1 2.5" }],
  snow: [{ d: cloudUp, f: "paper" }, { d: "M8 19h.01M12 19h.01M16 19h.01M10 22h.01M14 22h.01" }],
  storm: [{ d: cloudUp, f: "paper" }, { d: "M13 15.5l-2.5 3.5h3.5L11.5 22.5", f: "accent" }],
  fog: [{ d: "M5 8h14M3 12h18M5 16h14M8 20h8" }],
};

/** @typedef {keyof typeof SHAPES} IconName */

/**
 * @param {{ name: IconName, filled?: boolean, cel?: boolean, strokeWidth?: number, className?: string }} props
 * `filled` fills every shape with currentColor (the saved heart on a photo).
 * `cel` gives the main shapes their flat brand fill. `filled` wins if both are set.
 */
export function Icon({ name, filled = false, cel = false, strokeWidth = 2, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("size-5 shrink-0 overflow-visible", className)}
    >
      {SHAPES[name].map((s, i) => (
        <path
          key={i}
          d={s.d}
          className={s.f ? (filled ? "fill-current" : cel ? FILLS[s.f] : undefined) : undefined}
        />
      ))}
    </svg>
  );
}
