"use client";
/**
 * Reels-style paging for the feed scroller. Owner: Oscar.
 * One gesture = one card. The move eases out with a cubic curve, 1 − (1 − t)³: fast start, soft landing.
 *  - Touch: the page follows the finger, then on release flips to the next/previous card if you dragged
 *    past FLIP_RATIO of the screen or flicked faster than FLICK_SPEED, otherwise springs back.
 *    Mostly-horizontal gestures (the Swipe to go knob) and touches inside a sheet are left alone.
 *  - Wheel / trackpad: one flip per gesture, then locked until the inertia dies down.
 *  - Keys: ArrowDown / PageDown / j and ArrowUp / PageUp / k (not while typing or with a sheet open).
 * The scroller itself is overflow-hidden (no native snap), so the hook owns scrollTop. Anything else that
 * sets scrollTop (scrollTo top on refresh, focus moving to a card) still works: the index is always
 * derived from the current scrollTop. Reduced motion: instant jumps.
 */
import { useEffect } from "react";

const FLIP_RATIO = 0.18;
/** Release speed (px per ms, over the last VELOCITY_MS of the drag) that counts as a flick. */
const FLICK_SPEED = 0.45;
const VELOCITY_MS = 100;
const MIN_MS = 240;
const MAX_MS = 460;
const WHEEL_THRESHOLD = 24;
const WHEEL_LOCK_MS = 380;

/** @param {number} t 0..1 */
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** @param {React.RefObject<HTMLElement | null>} scrollerRef */
export function usePager(scrollerRef) {
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let animating = false;

    const pageH = () => el.clientHeight || 1;
    const maxTop = () => Math.max(0, el.scrollHeight - el.clientHeight);
    const indexNow = () => Math.round(el.scrollTop / pageH());

    /** Ease scrollTop to `top`; duration scales with the distance left. @param {number} top */
    const animateTo = (top) => {
      cancelAnimationFrame(frame);
      const to = Math.min(maxTop(), Math.max(0, top));
      const from = el.scrollTop;
      if (reduce.matches || Math.abs(to - from) < 1) {
        el.scrollTop = to;
        animating = false;
        return;
      }
      const ms = MIN_MS + (MAX_MS - MIN_MS) * Math.min(1, Math.abs(to - from) / pageH());
      const start = performance.now();
      animating = true;
      const step = (/** @type {number} */ now) => {
        const t = Math.min(1, (now - start) / ms);
        el.scrollTop = from + (to - from) * easeOutCubic(t);
        if (t < 1) frame = requestAnimationFrame(step);
        else animating = false;
      };
      frame = requestAnimationFrame(step);
    };

    /** @param {number} dir +1 next, -1 previous, 0 stay */
    const flip = (dir) => animateTo((indexNow() + dir) * pageH());

    /** @param {EventTarget | null} t */
    const inSheet = (t) => t instanceof Element && !!t.closest("dialog");
    const sheetOpen = () => !!el.querySelector("dialog[open]");

    // ---- Touch ----
    /** @type {{ y: number, x: number, top: number, samples: { y: number, t: number }[], axis: "x" | "y" | null } | null} */
    let touch = null;
    /** @param {TouchEvent} e */
    const onTouchStart = (e) => {
      if (e.touches.length !== 1 || inSheet(e.target)) return;
      cancelAnimationFrame(frame);
      animating = false;
      const p = e.touches[0];
      const now = performance.now();
      touch = { y: p.clientY, x: p.clientX, top: el.scrollTop, samples: [{ y: p.clientY, t: now }], axis: null };
    };
    /** @param {TouchEvent} e */
    const onTouchMove = (e) => {
      if (!touch) return;
      const p = e.touches[0];
      const dy = p.clientY - touch.y;
      const dx = p.clientX - touch.x;
      if (!touch.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        touch.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      }
      if (touch.axis !== "y") return;
      e.preventDefault();
      // Follow the finger; a little resistance past the first and last card.
      let top = touch.top - dy;
      if (top < 0) top /= 3;
      else if (top > maxTop()) top = maxTop() + (top - maxTop()) / 3;
      el.scrollTop = top;
      const now = performance.now();
      touch.samples.push({ y: p.clientY, t: now });
      while (touch.samples.length > 2 && now - touch.samples[0].t > VELOCITY_MS) touch.samples.shift();
    };
    const onTouchEnd = () => {
      const t = touch;
      touch = null;
      if (!t || t.axis !== "y") return;
      const last = t.samples[t.samples.length - 1];
      const first = t.samples[0];
      const dy = last.y - t.y;
      // Release velocity: how fast the finger was moving just before letting go.
      const v = (last.y - first.y) / Math.max(1, last.t - first.t);
      const speed = Math.abs(v);
      const startIndex = Math.round(t.top / pageH());
      const flicked = speed > FLICK_SPEED && Math.abs(dy) > 12 && Math.sign(v) === Math.sign(dy);
      const passed = Math.abs(dy) > pageH() * FLIP_RATIO || flicked;
      const dir = passed ? (dy < 0 ? 1 : -1) : 0;
      animateTo((startIndex + dir) * pageH());
    };

    // ---- Wheel / trackpad ----
    let wheelSum = 0;
    let wheelLockedUntil = 0;
    /** @param {WheelEvent} e */
    const onWheel = (e) => {
      if (inSheet(e.target) || e.ctrlKey) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLockedUntil || animating) {
        wheelLockedUntil = now + WHEEL_LOCK_MS; // still the same flick's inertia
        wheelSum = 0;
        return;
      }
      wheelSum += e.deltaY;
      if (Math.abs(wheelSum) >= WHEEL_THRESHOLD) {
        flip(wheelSum > 0 ? 1 : -1);
        wheelSum = 0;
        wheelLockedUntil = now + WHEEL_LOCK_MS;
      }
    };

    // ---- Keys ----
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || sheetOpen()) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const next = e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j";
      const prev = e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k";
      if (!next && !prev) return;
      e.preventDefault();
      flip(next ? 1 : -1);
    };

    // Keep a whole card in view when the screen size changes (rotation, browser bars).
    const ro = new ResizeObserver(() => {
      if (!animating && !touch) el.scrollTop = indexNow() * pageH();
    });
    ro.observe(el);

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [scrollerRef]);
}
