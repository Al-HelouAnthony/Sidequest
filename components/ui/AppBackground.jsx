"use client";
/**
 * Decorative, animated background behind a whole screen. Never interactive, hidden from screen readers.
 * variant "dots": a calm dot grid with a diagonal of softly pulsing orange dots (feed, plans, onboarding).
 * variant "radar": rings pulsing out from you, with friends glowing nearby (the You / profile screen).
 * Colors come from the theme tokens, so it follows light and dark. Motion stops under prefers-reduced-motion
 * (CSS in app/globals.css: sq-bg-pulse, sq-bg-ring).
 *
 * The dot pattern id is unique per instance (useId): Next keeps visited screens alive but hidden, so two
 * backgrounds can be in the page at once, and a shared id could make the visible one lose its dots.
 * @param {{ variant?: "dots" | "radar" }} props
 */
import { useId } from "react";

/** @param {{ variant?: "dots" | "radar" }} props */
export function AppBackground({ variant = "dots" }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-canvas">
      {variant === "radar" ? <Radar /> : <Dots />}
    </div>
  );
}

const PULSE_DOTS = [[2, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 14], [14, 16], [1, 18], [3, 20], [5, 22], [7, 24], [9, 26], [11, 28], [13, 30]];

function Dots() {
  const patternId = `sq-bg-dots-${useId().replace(/:/g, "")}`;
  return (
    <svg className="size-full" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id={patternId} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="13" cy="13" r="2.4" style={{ fill: "var(--color-ink)" }} opacity="0.08" />
        </pattern>
      </defs>
      <rect width="390" height="844" fill={`url(#${patternId})`} />
      {PULSE_DOTS.map(([col, row], i) => (
        <circle
          key={i}
          cx={13 + col * 26}
          cy={13 + row * 26}
          r="5"
          className="sq-bg-pulse"
          // Peak 0.25 (prompt had 0.55): brighter dots passing under plain text competed with it (foreground first).
          style={{ fill: "var(--color-accent)", "--lo": 0.05, "--hi": 0.25, animationDelay: `${(i * 0.2).toFixed(1)}s` }}
        />
      ))}
    </svg>
  );
}

/** Friend dots near the screen edges, so they don't sit between the content's chips and cards. */
const FRIENDS = [[22, 470], [368, 540], [30, 690], [360, 720]];
/** "You" sits behind the floating tab bar: the rings sweep up from there instead of from mid-screen content. */
const ME = { x: 195, y: 800 };

function Radar() {
  return (
    <svg className="size-full" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      {[0, 1, 2, 3].map((i) => (
        <circle
          key={i}
          cx={ME.x}
          cy={ME.y}
          r="300"
          fill="none"
          strokeWidth="2"
          className="sq-bg-ring"
          style={{ stroke: "var(--color-teal)", animationDelay: `${i * 1.5}s` }}
        />
      ))}
      <circle cx={ME.x} cy={ME.y} r="14" strokeWidth="3" style={{ fill: "var(--color-accent)", stroke: "var(--color-ink)", strokeOpacity: 0.3 }} />
      {FRIENDS.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="6"
          className="sq-bg-pulse"
          style={{ fill: "var(--color-teal)", "--lo": 0.2, "--hi": 0.55, animationDelay: `${i * 0.7}s` }}
        />
      ))}
    </svg>
  );
}
