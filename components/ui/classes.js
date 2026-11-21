/**
 * Shared class helpers for components/ui. Owner: Oscar.
 */

/**
 * Joins class names and skips falsy values: cn("a", cond && "b").
 * @param {...(string | false | null | undefined)} parts
 * @returns {string}
 */
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

/** Visible keyboard focus ring (thick orange, like the demo). Put it on every interactive element. */
export const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-accent";

/**
 * Small squish for taps on things WITHOUT the cel outline (ghost buttons, list rows, avatars).
 * Outlined buttons use the `press` utility instead (they sink into their shadow).
 */
export const pressable =
  "transition-[transform,background-color,color,opacity] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100";
