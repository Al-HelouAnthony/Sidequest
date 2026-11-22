/**
 * "$$" price level (1–4) with the unused dollars dimmed. Screen readers hear "Price: moderate".
 */
import { cn } from "./classes";

const LABELS = { 1: "cheap", 2: "moderate", 3: "pricey", 4: "splurge" };

/** @param {{ level: number, className?: string }} props `level` follows PriceLevel in types/domain.js (1–4). */
export function PriceLevel({ level, className }) {
  const n = Math.min(4, Math.max(1, Math.round(level)));
  return (
    <span className={cn("inline-flex font-bold tracking-tight tabular-nums", className)}>
      <span aria-hidden="true">
        {"$".repeat(n)}
        <span className="opacity-55">{"$".repeat(4 - n)}</span>
      </span>
      <span className="sr-only">Price: {LABELS[/** @type {1|2|3|4} */ (n)]}</span>
    </span>
  );
}
