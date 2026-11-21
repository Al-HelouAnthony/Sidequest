/**
 * Chip. Three behaviours, picked by the props you pass:
 *  - neither onClick nor onRemove → static label (small, not a tap target)
 *  - onClick  → toggle button (aria-pressed = selected), e.g. interest picker. Selected = teal.
 *  - onRemove → the whole chip is a "remove" button with an ✕, e.g. search filter chips
 */
import { cn, focusRing } from "./classes";
import { Icon } from "./Icon";

const TONES = {
  default: "border-[1.5px] border-line bg-surface text-ink",
  /** Frosted, for chips on top of a photo. */
  glass: "glass-photo text-white",
};

/**
 * @param {{
 *   children: React.ReactNode,
 *   selected?: boolean,
 *   onClick?: () => void,
 *   onRemove?: () => void,
 *   removeLabel?: string,
 *   tone?: keyof typeof TONES,
 *   icon?: React.ReactNode,
 *   className?: string,
 * }} props
 * `removeLabel` is the screen-reader text for removable chips. Defaults to "Remove <text>" when children is a string.
 */
export function Chip({ children, selected = false, onClick, onRemove, removeLabel, tone = "default", icon, className }) {
  const base = "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap";
  const buttonLook = cn("press", selected ? "bg-teal text-on-teal" : "bg-surface text-ink");

  if (onRemove) {
    const label = removeLabel ?? (typeof children === "string" ? `Remove ${children}` : "Remove");
    return (
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className={cn(base, buttonLook, focusRing, "min-h-11 pr-3 pl-4 text-sm", className)}
      >
        {icon}
        {children}
        <Icon name="x" strokeWidth={2.5} className="size-4" />
      </button>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(base, buttonLook, focusRing, "min-h-11 px-4 text-sm", className)}
      >
        {selected ? (
          <span key="on" className="motion-safe:animate-pop">
            <Icon name="check" strokeWidth={3} className="size-4" />
          </span>
        ) : (
          icon
        )}
        {children}
      </button>
    );
  }

  return (
    <span className={cn(base, selected ? "border-[1.5px] border-line bg-teal text-on-teal" : TONES[tone], "h-7 px-3 text-xs", className)}>
      {icon}
      {children}
    </span>
  );
}
