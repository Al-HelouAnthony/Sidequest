"use client";
/**
 * SwipeToGo: horizontal "swipe to break" slider (the brand bar, design-reference/the-bar.md,
 * rebuilt sideways from the demo's SwipeRail). Owner: Oscar.
 *
 * The knob doesn't follow the finger 1:1: knob = 0.86 × (1 − (1 − p)³) of the track, so the first
 * third flies, the middle drags and the end barely moves. Past 55% of the pull the bar strains
 * (shake, cracks, glow). At 97% of the pull, or on release past 90%, it breaks: the knob slams to the
 * end, the track shatters, a shockwave rings out and the knob turns teal with a check. `onGo` fires
 * ~700 ms after the break. Released early, it springs back.
 *
 * Pointer events live on the knob only, and it uses touch-action: pan-y, so a vertical swipe on it
 * still scrolls the feed (the browser then cancels our pointer and the knob springs back).
 * Keyboard: Enter / Space / ArrowRight. Reduced motion: no shake, cracks or shards, instant check.
 *
 * Reset after a break: change `resetKey` (or remount with a new `key`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { cn, focusRing } from "./classes";

const HEIGHT = 56;
/** Knob diameter. Kept well inside the track so its border + hard shadow never spill over the edge. */
const KNOB = 42;
/** Gap around the knob; (HEIGHT - KNOB) / 2 keeps it vertically centred. */
const PAD = (HEIGHT - KNOB) / 2;
/** Label lane: starts just right of the resting knob, keeps clear of the rounded end. */
const LABEL_LEFT = PAD + KNOB + 8;
const LABEL_RIGHT = 14;

/** Where the knob stalls before the break (fraction of the travel). */
const X_MAX = 0.86;
/** Finger progress → knob progress. */
const curve = (/** @type {number} */ p) => X_MAX * (1 - (1 - p) ** 3);
const STRAIN_AT = 0.55;
const BREAK_AT = 0.97;
const RELEASE_BREAK = 0.9;
const TICKS = [0.3, 0.6, 0.85];
const SNAP_MS = 160;
const GO_DELAY_MS = 700;

const SNAP_EASE = "cubic-bezier(0.8, 0, 1, 1)";
const SPRING_EASE = "cubic-bezier(0.2, 1.5, 0.35, 1)";

/** Crack zigzags: [fraction along the track, y in px]. */
const CRACKS = [
  [[0.02, 18], [0.18, 30], [0.3, 22], [0.46, 38], [0.6, 28]],
  [[0.22, 40], [0.38, 28], [0.54, 38], [0.72, 24], [0.92, 34]],
  [[0.5, 14], [0.64, 26], [0.78, 16], [0.97, 30]],
];

/** Distance between two spark bursts while dragging. */
const SPARK_STEP = 22;
/** Where the 3 pieces of a spark burst fly (px, halfway point; they go 2.4× further). */
const SPARK_DIRS = [[-10, -16], [-14, 2], [-8, 16]];

/** Shatter confetti: the palette, so the break feels like a celebration. */
const SHARD_COLORS = ["var(--color-accent)", "var(--color-teal)", "var(--color-warning)", "var(--color-peach)", "#ffffff"];

const SHARD_CLIPS = [
  "polygon(0 0,100% 8%,88% 100%,6% 86%)",
  "polygon(10% 0,100% 0,92% 92%,0 100%)",
  "polygon(0 12%,90% 0,100% 100%,14% 90%)",
];

/** @param {number | number[]} pattern */
function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iOS Safari, desktop): silent.
  }
}

const clamp01 = (/** @type {number} */ n) => Math.max(0, Math.min(1, n));

/**
 * @param {{
 *   onGo?: () => void,
 *   label?: string,
 *   doneLabel?: string,
 *   ariaLabel?: string,
 *   resetKey?: string | number,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export function SwipeToGo({
  onGo,
  label = "Swipe to go",
  doneLabel = "Let's go!",
  ariaLabel = "Let's go: swipe right or press Enter",
  resetKey = 0,
  disabled = false,
  className,
}) {
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  /** @type {React.RefObject<{ startX: number, startP: number, px: number, lastP: number } | null>} */
  const drag = useRef(null);
  const timers = useRef(/** @type {ReturnType<typeof setTimeout>[]} */ ([]));
  const broke = useRef(false);
  const onGoRef = useRef(onGo);

  const [w, setW] = useState(280);
  const [p, setP] = useState(0);
  const [phase, setPhase] = useState(/** @type {"idle" | "drag" | "snap" | "done"} */ ("idle"));
  /** Reduced motion, read at break time. */
  const [instant, setInstant] = useState(false);

  // Reset when the parent says so (state part during render, the React-recommended way).
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setPhase("idle");
    setP(0);
    setInstant(false);
  }
  // ...and the side-effect part: pending timers and the break guard.
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    broke.current = false;
    drag.current = null;
  }, [resetKey]);

  useEffect(() => {
    onGoRef.current = onGo;
  }, [onGo]);

  // Track width (fires once on observe, then on resize).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const travel = Math.max(1, w - KNOB - PAD * 2);
  const broken = phase === "snap" || phase === "done";
  const x = broken ? 1 : curve(p);
  const px = x * travel;
  const tension = broken ? 1 : clamp01((p - STRAIN_AT) / (BREAK_AT - STRAIN_AT));

  const shatter = useCallback(() => {
    if (broke.current || disabled) return;
    broke.current = true;
    drag.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setInstant(reduce);
    buzz([30, 30, 70]);
    if (reduce) {
      setPhase("done");
    } else {
      setPhase("snap");
      timers.current.push(setTimeout(() => setPhase("done"), SNAP_MS + 10));
    }
    timers.current.push(setTimeout(() => onGoRef.current?.(), GO_DELAY_MS));
  }, [disabled]);

  /** @param {React.PointerEvent<HTMLButtonElement>} e */
  const onPointerDown = (e) => {
    if (broke.current || disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail if the pointer is already gone; the drag still works while over the knob.
    }
    drag.current = { startX: e.clientX, startP: p, px: travel, lastP: p };
    setPhase("drag");
    buzz(6);
  };

  /** @param {React.PointerEvent<HTMLButtonElement>} e */
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const np = clamp01(d.startP + (e.clientX - d.startX) / d.px);
    if (TICKS.some((t) => d.lastP < t !== np < t)) buzz(np > 0.8 ? 14 : 8);
    d.lastP = np;
    setP(np);
    if (np >= BREAK_AT) shatter();
  };

  const springBack = () => {
    drag.current = null;
    setPhase("idle");
    setP(0);
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    if (d.lastP >= RELEASE_BREAK) shatter();
    else springBack();
  };

  /** @param {React.KeyboardEvent<HTMLButtonElement>} e */
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      shatter();
    }
  };

  const text = p < 0.05 ? label : tension <= 0 ? "Keep going" : tension < 0.6 ? "Harder" : "Almost…";
  const straining = phase === "drag" && tension > 0;

  // Cel look: a hard drop shadow, plus a thin flat ring that grows while you pull.
  const glow = `0 0 0 ${(x * 3 + tension * 2).toFixed(1)}px color-mix(in srgb, var(--color-accent) 30%, transparent), 0 3px 0 var(--color-shade)`;

  /** Transition for things that move with the knob. */
  const follow = (/** @type {string} */ prop) =>
    instant || phase === "drag" || phase === "done"
      ? "none"
      : phase === "snap"
        ? `${prop} ${SNAP_MS}ms ${SNAP_EASE}`
        : `${prop} 600ms ${SPRING_EASE}`;

  const knobCenter = PAD + KNOB / 2 + px;
  /** Width of the strip between the track's left inset and the knob, for the pull feedback. */
  const pullRoom = PAD + px - 8 - LABEL_RIGHT;
  const showFx = phase === "done" && !instant;

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full touch-pan-y select-none", disabled && "opacity-55", className)}
      style={{ height: HEIGHT }}
    >
      {/* Track */}
      <div
        aria-hidden="true"
        className={cn(
          "swipe-rail absolute inset-0 overflow-hidden rounded-full motion-safe:animate-stripes",
          straining && "motion-safe:animate-shake",
          phase === "snap" && "brightness-125 saturate-125 motion-safe:animate-shake",
          phase === "done" && "scale-105 opacity-0 transition-[opacity,transform] duration-75",
        )}
        style={{
          boxShadow: glow,
          "--amp": `${(phase === "snap" ? 5 : tension * 2.6).toFixed(2)}px`,
          scale: phase === "drag" ? String(1 + tension * 0.035) : undefined,
          transition: phase === "done" ? undefined : phase === "drag" ? "box-shadow 80ms linear" : "box-shadow 500ms ease",
        }}
      >
        {/* Light sweep across the idle track: "touch me". */}
        {phase === "idle" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-transparent via-white/45 to-transparent motion-safe:animate-shine motion-reduce:hidden"
          />
        )}
        {/* Pulled-through fill: heats up from teal to yellow. */}
        <div
          className={cn("swipe-heat absolute inset-y-0 left-0 rounded-full motion-safe:animate-stripes", x > 0 && "border-r-2 border-line")}
          style={{ width: x > 0 ? px + KNOB + PAD * 2 : 0, transition: follow("width") }}
        />

        {/* Cracks */}
        <svg
          className="pointer-events-none absolute inset-0 size-full motion-reduce:hidden"
          viewBox={`0 0 ${w} ${HEIGHT}`}
          preserveAspectRatio="none"
        >
          {CRACKS.map((pts, i) => (
            <path
              key={i}
              d={"M" + pts.map(([f, y]) => `${Math.round(f * w)} ${y}`).join(" L")}
              pathLength={1}
              fill="none"
              stroke="rgb(255 255 255 / 0.95)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeDasharray={1}
              strokeDashoffset={Math.max(0, 1 - tension * (1.2 - i * 0.15))}
            />
          ))}
        </svg>

        {/* Resting label: its own lane right of the knob; the chevrons always show. */}
        <div
          className="absolute inset-y-0 flex items-center justify-center gap-1 text-white transition-opacity duration-300 [text-shadow:0_2px_0_var(--color-line)] [&_svg]:drop-shadow-[0_2px_0_var(--color-line)]"
          style={{ left: LABEL_LEFT, right: LABEL_RIGHT, opacity: phase === "drag" || broken ? 0 : 1 }}
        >
          <span className="font-display text-base leading-none font-extrabold whitespace-nowrap">{label}</span>
          <span className="flex shrink-0 -space-x-1.5">
            {[0, 1, 2].map((i) => (
              <svg
                key={i}
                viewBox="0 0 24 24"
                className="size-3.5 motion-safe:animate-chev"
                style={{ animationDelay: `${i * 0.16}s` }}
                fill="none"
                stroke="currentColor"
                strokeWidth={3.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            ))}
          </span>
        </div>

        {/* Pull feedback ("Keep going" / "Harder" / "Almost…"): rides in the lighter pulled-through strip,
            right-aligned against the knob, and only shows once there is room for the whole word. */}
        {phase === "drag" && text !== label && (
          <div
            className="absolute inset-y-0 flex items-center justify-end overflow-hidden text-on-accent"
            style={{ left: LABEL_RIGHT, width: Math.max(0, pullRoom), opacity: clamp01((pullRoom - text.length * 8.5) / 16) }}
          >
            {/* Light halo so the white strain cracks fade out behind the word instead of cutting through it. */}
            <span
              key={text}
              className="font-display text-[15px] leading-none font-extrabold whitespace-nowrap [text-shadow:0_0_3px_rgb(255_255_255/0.9),0_0_10px_rgb(255_255_255/0.55)] motion-safe:animate-pop"
            >
              {text}
            </span>
          </div>
        )}
      </div>

      {/* Sparks: every SPARK_STEP px of pull, a 3-piece burst flies off behind the knob (palette colours). */}
      {phase === "drag" &&
        Array.from({ length: Math.min(4, Math.floor(px / SPARK_STEP) + 1) }, (_, k) => {
          const n = Math.floor(px / SPARK_STEP) - k;
          return SPARK_DIRS.map(([sx, sy], j) => (
            <span
              key={`${n}-${j}`}
              className="pointer-events-none absolute top-1/2 z-5 size-3 rounded-full border-[1.5px] border-line motion-safe:animate-spark motion-reduce:hidden"
              style={{
                left: PAD + n * SPARK_STEP,
                backgroundColor: SHARD_COLORS[(n + j) % SHARD_COLORS.length],
                "--sx": `${sx}px`,
                "--sy": `${sy}px`,
              }}
            />
          ));
        })}

      {/* Shatter */}
      {showFx &&
        Array.from({ length: 14 }, (_, i) => {
          const col = i % 7;
          const row = Math.floor(i / 7);
          const sw = w / 7;
          const sh = HEIGHT / 2;
          const dx = (col - 3) * 18 + (((i * 37) % 40) - 20);
          // Mostly upward: the card clips anything that falls below it.
          const dy = row === 0 ? -(40 + ((i * 53) % 70)) : -(10 + ((i * 37) % 50)) + ((i * 13) % 30);
          const rot = (i % 2 ? 1 : -1) * (40 + ((i * 71) % 160));
          return (
            <span
              key={`shard-${i}`}
              aria-hidden="true"
              className="swipe-shard pointer-events-none absolute z-5 animate-shard-fly"
              style={{
                left: col * sw,
                top: row * sh,
                width: sw,
                height: sh,
                clipPath: SHARD_CLIPS[i % 3],
                backgroundColor: SHARD_COLORS[i % SHARD_COLORS.length],
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
                "--rot": `${rot}deg`,
                animationDelay: `${(6 - col) * 0.015}s`,
              }}
            />
          );
        })}
      {showFx && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute z-6 animate-shock rounded-full border-3 border-teal"
            style={{ left: knobCenter, top: "50%", width: KNOB, height: KNOB, margin: -KNOB / 2 }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute z-6 animate-shock rounded-full border-3 border-accent"
            style={{ left: knobCenter, top: "50%", width: KNOB, height: KNOB, margin: -KNOB / 2, animationDelay: "120ms" }}
          />
        </>
      )}
      {phase === "done" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center font-display text-lg font-extrabold text-white drop-shadow-[0_2px_0_rgb(34_40_46/0.6)] motion-safe:animate-rise"
          style={{ right: KNOB + PAD * 2, animationDelay: "250ms" }}
        >
          {doneLabel}
        </span>
      )}

      {/* Knob */}
      <div
        className={cn("absolute z-10", phase === "idle" && !disabled && "motion-safe:[&>button]:animate-knob-hint")}
        style={{ top: PAD, left: PAD, transform: `translateX(${px}px)`, transition: follow("transform") }}
      >
        <button
          type="button"
          aria-label={ariaLabel}
          aria-disabled={broken || disabled || undefined}
          disabled={disabled}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={springBack}
          onKeyDown={onKeyDown}
          className={cn(
            "relative grid touch-pan-y place-items-center rounded-full border-2 border-line",
            broken ? "cursor-default" : "cursor-grab active:cursor-grabbing",
            phase === "done"
              ? cn("bg-teal text-on-teal", !instant && "animate-land")
              : straining
                ? "bg-warning text-on-accent"
                : "bg-on-accent text-white",
            focusRing,
          )}
          style={{
            width: KNOB,
            height: KNOB,
            transform:
              phase === "drag" ? `scale(${(1.03 + x * 0.04 + tension * 0.03).toFixed(3)})` : undefined,
            boxShadow: `0 3px 0 var(--color-shade), 0 0 0 ${(x * 3).toFixed(1)}px rgb(255 255 255 / 0.4)`,
          }}
        >
          {phase === "done" ? (
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                pathLength={1}
                fill="none"
                stroke="currentColor"
                strokeWidth={3.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={1}
                strokeDashoffset={instant ? 0 : 1}
                className={instant ? undefined : "animate-draw-check"}
              />
            </svg>
          ) : (
            <span className={phase === "drag" ? undefined : "motion-safe:animate-nudge-x"}>
              <Icon name="arrowRight" strokeWidth={2.6} className="size-5" />
            </span>
          )}
        </button>
      </div>

      <span role="status" className="sr-only">
        {broken ? doneLabel : ""}
      </span>
    </div>
  );
}
