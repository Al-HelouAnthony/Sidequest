"use client";
/**
 * Decorative background behind a whole screen: one clean, still dot grid on every screen.
 * Never interactive, hidden from screen readers. Colors come from theme tokens (light + dark).
 *
 * The dot pattern id is unique per instance (useId): Next keeps visited screens alive but hidden, so two
 * backgrounds can be in the page at once, and a shared id could make the visible one lose its dots.
 * `variant` is accepted for older call sites but ignored (the radar was retired for a cleaner look).
 * @param {{ variant?: string }} props
 */
import { useId } from "react";

export function AppBackground({ variant } = {}) {
  const patternId = `sq-bg-dots-${useId().replace(/:/g, "")}`;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-canvas" style={{ viewTransitionName: "app-bg" }}>
      <svg className="size-full">
        <defs>
          <pattern id={patternId} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="1.6" style={{ fill: "var(--color-ink)" }} opacity="0.22" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
