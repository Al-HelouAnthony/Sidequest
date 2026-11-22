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
 * Look (design-system skill): orange striped rail with an ink outline, rim + band + hard shadow, slate knob,
 * teal fill behind the knob. Motion = the first version (439e049).
 *
 * Reset after a break: change `resetKey` (or remount with a new `key`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { cn, focusRing } from "./classes";

const HEIGHT = 56;
/** Knob diameter. Kept well inside the track so its border + hard shadow never spill over the edge. */
const KNOB = 44;
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

/** Intense mode: more zigzags, spreading over the whole bar as the strain builds. */
const MORE_CRACKS = [
  [[0.08, 10], [0.2, 24], [0.33, 12], [0.5, 26], [0.66, 8]],
  [[0.12, 46], [0.28, 34], [0.44, 48], [0.58, 36], [0.8, 46]],
  [[0.35, 30], [0.52, 20], [0.7, 34], [0.86, 18], [0.99, 26]],
  [[0.6, 48], [0.74, 38], [0.88, 50], [0.98, 42]],
  [[0.68, 6], [0.82, 20], [0.95, 8]],
];
/** Intense mode: cracks that shoot out of the knob and stretch ahead of it ([angle in deg, length factor]). */
const KNOB_CRACKS = [[-28, 1], [8, 1.25], [34, 0.9], [-62, 0.55], [62, 0.6], [-8, 0.8]];

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
 *   intense?: boolean,
 * }} props
 * `intense`: extra cracks that keep spreading and stretch out of the knob near the end, then a bigger break
 * (more shards flying further, a white flash, four shockwaves, a shake and a longer buzz).
 */
export function SwipeToGo({
  onGo,
  label = "Swipe to go",
  doneLabel = "Let's go!",
  ariaLabel = "Let's go: swipe right or press Enter",
  resetKey = 0,
  disabled = false,
  className,
  intense = false,
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
    buzz(intense ? [40, 25, 40, 25, 140] : [30, 30, 70]);
    if (reduce) {
      setPhase("done");
    } else {
      setPhase("snap");
      timers.current.push(setTimeout(() => setPhase("done"), SNAP_MS + 10));
    }
    timers.current.push(setTimeout(() => onGoRef.current?.(), GO_DELAY_MS));
  }, [disabled, intense]);

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
    // Intense: a crackle buzz each time the strain climbs another step.
    if (intense && np > STRAIN_AT && Math.floor(np * 20) !== Math.floor(d.lastP * 20)) buzz(np > 0.9 ? 12 : 5);
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

  // First version's glow, cel style: a flat accent ring that swells with the pull and the strain (no blur),
  // on top of the rim + band + hard shadow every island has.
  const glow = [
    "var(--shadow-rim)",
    "var(--shadow-band)",
    `0 0 0 ${(3 + x * 6 + tension * 3).toFixed(1)}px color-mix(in srgb, var(--color-accent) ${Math.round(22 + x * 20)}%, transparent)`,
    "0 4px 0 var(--color-shade)",
  ].join(", ");

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
      data-no-tab-swipe
      className={cn(
        "relative w-full touch-pan-y select-none",
        disabled && "opacity-55",
        intense && phase === "snap" && "motion-safe:animate-shake",
        className,
      )}
      style={{ height: HEIGHT, "--amp": intense && phase === "snap" ? "8px" : undefined }}
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
          transition: phase === "done" ? undefined : phase === "drag" ? "box-shadow 80ms linear" : "box-shadow 500ms ease",
        }}
      >
        {/* Pulled-through fill: solid teal with moving stripes. */}
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
              strokeWidth={intense ? 2.2 + tension * 1.2 : 2.2}
              strokeLinejoin="round"
              strokeDasharray={1}
              strokeDashoffset={Math.max(0, 1 - tension * (1.2 - i * 0.15))}
            />
          ))}
          {intense &&
            MORE_CRACKS.map((pts, i) => (
              <path
                key={`m${i}`}
                d={"M" + pts.map(([f, y]) => `${Math.round(f * w)} ${y}`).join(" L")}
                pathLength={1}
                fill="none"
                stroke="rgb(255 255 255 / 0.9)"
                strokeWidth={1.6 + tension}
                strokeLinejoin="round"
                strokeDasharray={1}
                // Start later than the first three, then race to full length by the break.
                strokeDashoffset={Math.max(0, 1 - clamp01((tension - 0.25 - i * 0.07) / 0.55))}
              />
            ))}
          {intense &&
            tension > 0.45 &&
            KNOB_CRACKS.map(([deg, k], i) => {
              // Cracks shooting out of the knob, stretching longer as the strain nears the break.
              const len = (tension - 0.45) ** 1.4 * 150 * k;
              const a = (deg * Math.PI) / 180;
              const x0 = knobCenter + KNOB / 2 - 2;
              const y0 = HEIGHT / 2;
              const mx = x0 + Math.cos(a) * len * 0.5 + (i % 2 ? 4 : -4);
              const my = y0 + Math.sin(a) * len * 0.5;
              const ex = x0 + Math.cos(a) * len;
              const ey = y0 + Math.sin(a) * len;
              return (
                <path
                  key={`k${i}`}
                  d={`M${x0} ${y0} L${mx} ${my} L${ex} ${ey}`}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.4 + tension * 1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
        </svg>

        {/* Ticks */}
        {TICKS.map((t, i) => {
          const lit = p >= t;
          return (
            <span
              key={`${i}-${lit}`}
              className={cn(
                // On the bottom edge, so they never sit on the label.
                "absolute bottom-[5px] size-1.5 rounded-full",
                lit ? "bg-white motion-safe:animate-pop" : "bg-white/50",
              )}
              style={{ left: PAD + KNOB / 2 + curve(t) * travel - 3 }}
            />
          );
        })}

        {/* Resting label: its own lane right of the knob; the chevrons always show. */}
        <div
          className="absolute inset-y-0 flex items-center justify-center gap-1 text-on-accent transition-opacity duration-300"
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
            <span
              key={text}
              className="font-display text-[15px] leading-none font-extrabold whitespace-nowrap text-on-teal [text-shadow:0_0_3px_var(--color-teal),0_0_10px_var(--color-teal)] motion-safe:animate-pop"
            >
              {text}
            </span>
          </div>
        )}
      </div>

      {/* Shatter */}
      {showFx &&
        Array.from({ length: intense ? 36 : 14 }, (_, i) => {
          const cols = intense ? 12 : 7;
          const rows = intense ? 3 : 2;
          const col = i % cols;
          const row = Math.floor(i / cols);
          const sw = w / cols;
          const sh = HEIGHT / rows;
          const boost = intense ? 1.9 : 1;
          const mid = (cols - 1) / 2;
          const dx = ((col - mid) * (intense ? 14 : 18) + (((i * 37) % 40) - 20)) * boost;
          // Mostly upward: the card clips anything that falls below it.
          const dy = (row === 0 ? -(40 + ((i * 53) % 70)) : -(10 + ((i * 37) % 50)) + ((i * 13) % 30)) * boost;
          const rot = (i % 2 ? 1 : -1) * (40 + ((i * 71) % 160)) * (intense ? 1.6 : 1);
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
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
                "--rot": `${rot}deg`,
                animationDelay: `${(cols - 1 - col) * (intense ? 0.008 : 0.015)}s`,
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
          {intense && (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute z-6 animate-shock rounded-full border-4 border-white"
                style={{ left: knobCenter, top: "50%", width: KNOB * 1.4, height: KNOB * 1.4, margin: -KNOB * 0.7, animationDelay: "60ms" }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute z-6 animate-shock rounded-full border-3 border-teal"
                style={{ left: knobCenter, top: "50%", width: KNOB * 2, height: KNOB * 2, margin: -KNOB, animationDelay: "240ms" }}
              />
              {/* White flash where the bar was. */}
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-4 animate-flash rounded-full bg-white" />
            </>
          )}
        </>
      )}
      {phase === "done" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center font-display text-lg font-extrabold text-white drop-shadow-[0_2px_0_var(--color-shade)] motion-safe:animate-rise"
          style={{ right: KNOB + PAD * 2, animationDelay: "250ms" }}
        >
          {doneLabel}
        </span>
      )}

      {/* Knob */}
      <div
        className="absolute z-10"
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
              ? cn("bg-teal text-on-teal", !instant && (intense ? "animate-land-stretch" : "animate-land"))
              : "bg-on-accent text-white",
            focusRing,
          )}
          style={{
            width: KNOB,
            height: KNOB,
            transform:
              phase === "drag" ? `scale(${(1.03 + x * 0.04 + tension * 0.03).toFixed(3)})` : undefined,
            boxShadow: `var(--shadow-rim), var(--shadow-band), 0 3px 0 var(--color-shade), 0 0 0 ${(x * 3).toFixed(1)}px rgb(255 255 255 / 0.4)`,
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
