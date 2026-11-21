/**
 * Loading placeholder block with a shimmer. Size and shape come from className
 * (e.g. "h-4 w-32 rounded-full"; defaults to rounded-lg). Hidden from screen readers: pair a screen of
 * skeletons with one <span className="sr-only">Loading…</span>.
 */
import { cn } from "./classes";

/** @param {{ className?: string }} props */
export function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden bg-raised",
        // Default shape only when the caller didn't pick one (two rounded-* classes would fight).
        !className?.includes("rounded") && "rounded-lg",
        "before:absolute before:inset-0 before:bg-linear-to-r before:from-transparent before:via-white/40 before:to-transparent",
        "motion-safe:before:animate-shimmer motion-reduce:before:hidden",
        className,
      )}
    />
  );
}
