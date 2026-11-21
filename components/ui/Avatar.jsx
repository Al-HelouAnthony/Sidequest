"use client";
/**
 * Avatar + AvatarStack. Cel style: every face gets the ink outline, like the demo's illustrated profile pics.
 * Falls back to initials on a brand tint (picked from the name, so it's stable) if the image fails.
 * Uses <img> rather than next/image so remote hosts don't need next.config changes.
 */
import { useState } from "react";
import { cn } from "./classes";

const SIZES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
  xl: "size-16 text-lg",
};

/** Overlap per size (about 30% of the width, like the demo's FaceStack). */
const OVERLAP = { sm: "-space-x-2", md: "-space-x-2.5", lg: "-space-x-3.5", xl: "-space-x-5" };

/** Fixed light tints (not theme tokens), so the dark initials stay readable in both themes. */
const TINTS = ["bg-teal", "bg-peach", "bg-accent", "bg-[#efe8dd]"];

const TONES = {
  /** On app surfaces: ink outline. */
  app: "border-2 border-line",
  /** On a place photo: white outline so it reads on any image. */
  photo: "border-2 border-white",
};

/** @param {string} name */
function initials(name) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** @param {string} name */
function tintFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

const listFormat = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/**
 * @param {{
 *   src?: string,
 *   name: string,
 *   size?: keyof typeof SIZES,
 *   tone?: keyof typeof TONES,
 *   decorative?: boolean,
 *   className?: string,
 * }} props
 * `decorative` hides it from screen readers (use when a parent already says the names, e.g. AvatarStack).
 */
export function Avatar({ src, name, size = "md", tone = "app", decorative = false, className }) {
  // Remember WHICH src failed, so a new src gets a fresh try without an effect.
  const [failedSrc, setFailedSrc] = useState(/** @type {string | null} */ (null));
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold text-on-teal",
        tintFor(name),
        TONES[tone],
        SIZES[size],
        className,
      )}
      aria-hidden={decorative || undefined}
    >
      <span aria-hidden="true">{initials(name)}</span>
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- remote avatars, see file comment
        <img
          src={src}
          alt={decorative ? "" : name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {!showImage && !decorative && <span className="sr-only">{name}</span>}
    </span>
  );
}

/**
 * Overlapping avatars with a "+N" bubble. Screen readers hear the full list of names once.
 * The first face sits on top, like the demo.
 * @param {{
 *   people: { id: string, name: string, avatarUrl?: string }[],
 *   max?: number,
 *   size?: keyof typeof SIZES,
 *   tone?: keyof typeof TONES,
 *   className?: string,
 * }} props
 * `tone`: "app" on app surfaces, "photo" on top of a place photo.
 */
export function AvatarStack({ people, max = 3, size = "md", tone = "app", className }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const label = people.length ? listFormat.format(people.map((p) => p.name)) : "Nobody";

  return (
    <div role="img" aria-label={label} className={cn("flex items-center", OVERLAP[size], className)}>
      {shown.map((p, i) => (
        <span key={p.id} className="relative inline-flex rounded-full" style={{ zIndex: shown.length - i + 1 }}>
          <Avatar src={p.avatarUrl} name={p.name} size={size} tone={tone} decorative />
        </span>
      ))}
      {extra > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-bold text-ink",
            TONES[tone],
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
