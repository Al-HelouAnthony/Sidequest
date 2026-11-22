"use client";
/**
 * Full-screen story viewer for Memories (Snapchat-style).
 *  - Bars at the top: one per photo of the outing; the current one fills over STORY_MS while playing.
 *  - Tap right = next, tap left third = previous, hold = pause, swipe down = close.
 *  - Keys: ← / →, Space (play/pause), Esc (close). Reduced motion: no auto-advance (tap / arrows instead).
 *  - After an outing's last photo it carries on with the next (older) outing, then closes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toLocal } from "@/lib/time";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing } from "@/components/ui/classes";

const STORY_MS = 5000;
const TAP_MS = 250;
const SWIPE_CLOSE_PX = 90;

/** @typedef {import("@/types/api").MemoriesResponseT["memories"][number]} Memory */

/**
 * @param {{
 *   memories: Memory[],
 *   start: { memory: number, photo: number, play: boolean },
 *   onClose: () => void,
 * }} props
 */
export function MemoryViewer({ memories, start, onClose }) {
  const [pos, setPos] = useState({ m: start.memory, p: start.photo });
  const [playing, setPlaying] = useState(start.play);
  const [reduce] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [dragY, setDragY] = useState(0);
  /** Paused mid-photo (the bar keeps its place and resumes from there). */
  const [paused, setPaused] = useState(false);
  const fillRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const animRef = useRef(/** @type {Animation | null} */ (null));
  const closeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const pointer = useRef(/** @type {{ x: number, y: number, t: number } | null} */ (null));

  const memory = memories[pos.m];
  const photo = memory?.photos[pos.p];
  const autoplay = playing && !reduce;

  const next = useCallback(() => {
    setPaused(false);
    setPos(({ m, p }) => {
      if (p < memories[m].photos.length - 1) return { m, p: p + 1 };
      if (m < memories.length - 1) return { m: m + 1, p: 0 };
      queueMicrotask(onClose);
      return { m, p };
    });
  }, [memories, onClose]);

  const prev = useCallback(() => {
    setPaused(false);
    setPos(({ m, p }) => {
      if (p > 0) return { m, p: p - 1 };
      if (m > 0) return { m: m - 1, p: memories[m - 1].photos.length - 1 };
      return { m, p };
    });
  }, [memories]);

  // The current bar fills while playing; when it's full, go to the next photo.
  useEffect(() => {
    const el = fillRef.current;
    animRef.current?.cancel();
    animRef.current = null;
    if (!el || !autoplay) return;
    const anim = el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: STORY_MS, fill: "forwards" });
    anim.onfinish = next;
    animRef.current = anim;
    return () => {
      anim.onfinish = null;
      anim.cancel();
    };
  }, [pos, autoplay, next]);

  /** Pause / resume the running bar; from the grid (not playing yet) it starts the story. */
  const togglePlay = useCallback(() => {
    const anim = animRef.current;
    if (!anim) {
      setPlaying(true);
      setPaused(false);
    } else if (anim.playState === "paused") {
      anim.play();
      setPaused(false);
    } else {
      anim.pause();
      setPaused(true);
    }
  }, []);

  // Warm the next photo so it shows at once.
  useEffect(() => {
    const following = memory?.photos[pos.p + 1] ?? memories[pos.m + 1]?.photos[0];
    if (following) new Image().src = following.url;
  }, [memories, memory, pos]);

  // Modal basics: focus the close button, lock the page scroll, give focus back on close.
  useEffect(() => {
    const before = /** @type {HTMLElement | null} */ (document.activeElement);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose, togglePlay]);

  if (!memory || !photo) return null;

  const byWhom = memory.people.find((p) => p.userId === photo.userId);
  const taken = toLocal(photo.createdAt).toFormat("h:mm a");
  const day = toLocal(memory.startAt).toFormat("ccc, LLL d");

  /** @param {React.PointerEvent<HTMLDivElement>} e */
  const down = (e) => {
    pointer.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    animRef.current?.pause();
  };
  /** @param {React.PointerEvent<HTMLDivElement>} e */
  const move = (e) => {
    const p = pointer.current;
    if (p) setDragY(Math.max(0, e.clientY - p.y));
  };
  /** @param {React.PointerEvent<HTMLDivElement>} e */
  const up = (e) => {
    const p = pointer.current;
    pointer.current = null;
    setDragY(0);
    if (!p) return;
    const dy = e.clientY - p.y;
    const dx = e.clientX - p.x;
    if (dy > SWIPE_CLOSE_PX && Math.abs(dy) > Math.abs(dx)) return onClose();
    const tap = performance.now() - p.t < TAP_MS && Math.abs(dx) < 12 && Math.abs(dy) < 12;
    if (!tap) {
      if (!paused) animRef.current?.play(); // it was a hold: carry on
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 3) prev();
    else next();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Memories: ${memory.place.name}`}
      className="fixed inset-0 z-50 flex justify-center bg-black"
    >
      <div
        className="relative h-dvh w-full max-w-md overflow-hidden"
        style={{ transform: dragY ? `translateY(${dragY}px) scale(${1 - Math.min(dragY, 300) / 1500})` : undefined, transition: dragY ? "none" : "transform 200ms" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs */}
        <img
          key={photo.id}
          src={photo.url}
          alt={`Memory at ${memory.place.name} by ${byWhom?.name ?? "a friend"}, ${taken}`}
          className="absolute inset-0 size-full object-contain motion-safe:animate-fade-in"
        />

        {/* Tap / hold / swipe surface (under the top bar, which has its own buttons). */}
        <div
          className="absolute inset-0 touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            pointer.current = null;
            setDragY(0);
            if (!paused) animRef.current?.play();
          }}
          aria-hidden="true"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 space-y-3 bg-linear-to-b from-black/70 to-transparent px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-10 text-white">
          <div className="flex gap-1" aria-hidden="true">
            {memory.photos.map((ph, i) => (
              <span key={ph.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                <span
                  ref={i === pos.p ? fillRef : undefined}
                  className="block h-full origin-left rounded-full bg-white"
                  style={{ transform: i < pos.p || (i === pos.p && !autoplay) ? "scaleX(1)" : "scaleX(0)" }}
                />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            {byWhom && <Avatar src={byWhom.avatarUrl} name={byWhom.name} size="md" tone="photo" decorative />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{memory.place.name}</p>
              <p className="truncate text-sm text-white/80">
                {byWhom ? `${byWhom.name.split(" ")[0]} · ` : ""}
                {day} · {taken}
              </p>
            </div>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={autoplay && !paused ? "Pause" : "Play"}
              className={cn("pointer-events-auto inline-flex size-11 items-center justify-center rounded-full bg-white/15 text-lg font-bold", focusRing)}
            >
              <span aria-hidden="true">{autoplay && !paused ? "❚❚" : "▶"}</span>
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close memories"
              className={cn("pointer-events-auto inline-flex size-11 items-center justify-center rounded-full bg-white/15", focusRing)}
            >
              <Icon name="x" strokeWidth={2.6} className="size-5" />
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-linear-to-t from-black/70 to-transparent px-4 pt-10 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white">
          <p className="text-sm font-semibold tabular-nums" aria-live="polite">
            {pos.p + 1} / {memory.photos.length}
          </p>
          <Link
            href={`/plans/${memory.planId}?from=memories`}
            className={cn("pointer-events-auto inline-flex min-h-11 items-center rounded-full bg-white/15 px-4 text-sm font-bold", focusRing)}
          >
            Open the plan
          </Link>
        </div>

        {/* Screen readers / keyboard: real buttons for previous / next. */}
        <button type="button" onClick={prev} className="sr-only focus:not-sr-only">
          Previous photo
        </button>
        <button type="button" onClick={next} className="sr-only focus:not-sr-only">
          Next photo
        </button>
      </div>
    </div>
  );
}
