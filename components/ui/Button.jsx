/**
 * Button + IconButton. Every size is at least 44 px tall (tap target).
 * Cel style: outlined, with a hard shadow the button sinks into when pressed (`press` utility).
 * For a link that looks like a button, use buttonClasses() on next/link.
 */
import { cn, focusRing, pressable } from "./classes";

const VARIANTS = {
  /** Orange. One per screen: the thing you want people to do. */
  primary: "press bg-accent text-on-accent",
  /** Paper island button. */
  secondary: "press bg-surface text-ink",
  /** Slate, for a strong selected state (e.g. the picked time slot). */
  dark: "press bg-ink text-canvas",
  /** No outline: low-priority actions ("Not now"). */
  ghost: cn("bg-transparent text-ink hover:bg-ink/5", pressable),
};

const SIZES = {
  md: "min-h-11 rounded-full px-5 text-sm",
  lg: "min-h-14 rounded-button px-6 text-base",
};

/**
 * Class string for a button-looking element.
 * @param {{ variant?: keyof typeof VARIANTS, size?: keyof typeof SIZES, fullWidth?: boolean, className?: string }} [opts]
 * @returns {string}
 */
export function buttonClasses({ variant = "primary", size = "md", fullWidth = false, className } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 font-bold",
    "disabled:cursor-not-allowed disabled:opacity-55",
    focusRing,
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

/**
 * @param {React.ButtonHTMLAttributes<HTMLButtonElement> & {
 *   variant?: "primary" | "secondary" | "dark" | "ghost",
 *   size?: "md" | "lg",
 *   fullWidth?: boolean,
 *   loading?: boolean,
 *   leadingIcon?: React.ReactNode,
 *   trailingIcon?: React.ReactNode,
 * }} props
 * `loading` disables the button and swaps the leading icon for a spinner (text stays, so no layout shift).
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}

const ICON_VARIANTS = {
  /** Dark frost, for buttons that sit on a photo (feed card actions). */
  glass: cn("glass-photo text-white hover:bg-black/55", pressable),
  /** Paper island button (back, info). */
  solid: "press bg-surface text-ink",
  ghost: cn("text-ink hover:bg-ink/5", pressable),
  accent: "press bg-accent text-on-accent",
  /** The demo's slate knob. */
  dark: "press bg-ink text-canvas",
};

const ICON_SIZES = {
  md: "size-11",
  lg: "size-14",
};

/**
 * Round button with only an icon. `label` is required: it becomes the aria-label.
 * Pass `pressed` for toggles (Save) so screen readers announce the on/off state.
 * @param {React.ButtonHTMLAttributes<HTMLButtonElement> & {
 *   label: string,
 *   icon: React.ReactNode,
 *   variant?: keyof typeof ICON_VARIANTS,
 *   size?: keyof typeof ICON_SIZES,
 *   pressed?: boolean,
 * }} props
 */
export function IconButton({
  label,
  icon,
  variant = "glass",
  size = "md",
  pressed,
  className,
  type = "button",
  ...rest
}) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full",
        "disabled:cursor-not-allowed disabled:opacity-55",
        focusRing,
        ICON_VARIANTS[variant],
        ICON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
