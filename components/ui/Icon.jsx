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
  /** Follows the theme (light paper in light mode, dark surface in dark mode). */
  paper: "fill-surface",
};

/**
 * `w`: stroke-width multiplier for that path (e.g. 0.7 keeps the compass needle and ticks thin).
 * @typedef {{ d: string, f?: keyof typeof FILLS, w?: number }} Shape
 */

/** Base cloud, reused (shifted up) by rain / snow / storm. */
const cloud = "M7 19a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5a4.5 4.5 0 0 1 .5 9.5z";
const cloudUp = "M7 16a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6.5a4.5 4.5 0 0 1 .5 9.5z";

/** @type {Record<string, Shape[]>} */
const SHAPES = {
  x: [{ d: "M6.5 6.5l11 11M17.5 6.5l-11 11" }],
  heart: [{ d: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z", f: "accent" }],
  arrowRight: [{ d: "M4.5 12h15M13.5 6l6 6-6 6" }],
  arrowDown: [{ d: "M12 4.5v15M6 13.5l6 6 6-6" }],
  back: [{ d: "M15 5l-7 7 7 7" }],
  check: [{ d: "M5 12.5l4.5 4.5L19 7.5" }],
  plus: [{ d: "M12 5v14M5 12h14" }],
  search: [
    { d: "M10.5 3.5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z", f: "paper" },
    { d: "M15.6 15.6l4.9 4.9" },
    { d: "M7.6 9.2a3.2 3.2 0 0 1 2.4-2.4" },
  ],
  /** Feed tab: a compass (discover). */
  compass: [
    { d: "M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19z", f: "paper" },
    { d: "M12 4.6v1.3M19.4 12h-1.3M12 19.4v-1.3M4.6 12h1.3", w: 0.7 },
    { d: "M16.9 7.1L13.2 13.2L10.8 10.8Z", f: "accent", w: 0.7 },
    { d: "M7.1 16.9L10.8 10.8L13.2 13.2Z", w: 0.7 },
  ],
  /** Memories tab: a camera. */
  camera: [
    { d: "M3.5 8.5A2 2 0 0 1 5.5 6.5h2.2l1.5-2h5.6l1.5 2h2.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z", f: "teal" },
    { d: "M12 16.8a3.6 3.6 0 1 0 0-7.2a3.6 3.6 0 1 0 0 7.2z", f: "paper" },
    { d: "M17.6 9.4a.9.9 0 1 0 0-1.8a.9.9 0 1 0 0 1.8z", f: "accent", w: 0.7 },
  ],
  /** You tab: a person. */
  user: [
    { d: "M12 11.5a3.8 3.8 0 1 0 0-7.6a3.8 3.8 0 1 0 0 7.6z", f: "teal" },
    { d: "M4.5 20.5c.9-3.9 3.8-6 7.5-6s6.6 2.1 7.5 6" },
  ],
  calendar: [
    { d: "M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z", f: "paper" },
    { d: "M4 10h16M8.5 3v4M15.5 3v4" },
    { d: "M13.5 13.5h3.5v3h-3.5z", f: "accent" },
  ],
  refresh: [{ d: "M20.5 12a8.5 8.5 0 1 1-2.6-6.1L20.5 8.5" }, { d: "M20.5 3.5v5h-5" }],
  info: [
    { d: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", f: "teal" },
    { d: "M12 11v5.5M12 7.8h.01" },
  ],
  clock: [
    { d: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", f: "teal" },
    { d: "M12 7v5l3.2 2" },
  ],
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
 * `strokeWidth` defaults to 1.5 ("Cel pop" style); pass a bigger one for small or bold icons.
 */
export function Icon({ name, filled = false, cel = false, strokeWidth = 1.5, className }) {
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
          strokeWidth={s.w ? strokeWidth * s.w : undefined}
          className={s.f ? (filled ? "fill-current" : cel ? FILLS[s.f] : undefined) : undefined}
        />
      ))}
    </svg>
  );
}
