"use client";
/**
 * Swipe left/right anywhere on a tabbed screen to go to the next/previous tab (Feed → Plans → Memories → Friends → You).
 * The page follows the finger (a little resistance on the first/last tab); release past a quarter of the
 * screen, or flick, and it slides to the next tab (same full-width slide as tapping a tab); otherwise it
 * springs back. Ignored where a horizontal gesture already means something: sheets and dialogs, sliders
 * ("Swipe to go"), text fields, sideways-scrolling rows, and anything marked data-no-tab-swipe. Vertical
 * gestures (the feed pager, page scroll) are left alone. Plain touch events: no library needed.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { anchorTabBar } from "./PageTransition";

const AXIS_PX = 10; // movement before we decide horizontal vs vertical
const FLIP_RATIO = 0.25; // of the screen width
const FLICK_SPEED = 0.5; // px per ms
const EDGE_RESISTANCE = 0.25;

/** @param {EventTarget | null} t */
function excluded(t) {
  if (!(t instanceof Element)) return true;
  if (t.closest("dialog, [role=dialog], [role=slider], [data-no-tab-swipe], input, textarea, select")) return true;
  for (let el = /** @type {Element | null} */ (t); el && el !== document.body; el = el.parentElement) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/** The page on screen (pages kept alive by Next are display:none). */
const visibleMain = () => /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll("main")].find((m) => m.getClientRects().length > 0));
const visibleNav = () => /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll("nav[data-tabbar]")].find((n) => n.getClientRects().length > 0));

/**
 * @param {number} index current tab index
 * @param {readonly { href: string }[]} tabs
 */
export function useTabSwipe(index, tabs) {
  const router = useRouter();
  useEffect(() => {
    /** @type {null | { x: number, y: number, axis: "x" | "y" | null, dx: number, samples: { x: number, t: number }[], main?: HTMLElement, nav?: HTMLElement, navInMain?: boolean }} */
    let g = null;
    /** @param {number} x */
    const place = (x, ms = 0) => {
      if (!g?.main) return;
      const transition = ms ? `translate ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : "none";
      g.main.style.transition = transition;
      g.main.style.translate = `${x}px 0`;
      // The tab bar is inside <main> on most screens: counter-move it so it stays put.
      if (g.navInMain && g.nav) {
        g.nav.style.transition = transition;
        g.nav.style.translate = `${-x}px 0`;
      }
    };
    const clear = (/** @type {HTMLElement | undefined} */ main, /** @type {HTMLElement | undefined} */ nav, after = 0) =>
      setTimeout(() => {
        for (const el of [main, nav]) if (el) el.style.translate = el.style.transition = "";
      }, after);

    /** @param {TouchEvent} e */
    const onStart = (e) => {
      g = null;
      if (e.touches.length !== 1 || excluded(e.target)) return;
      const p = e.touches[0];
      g = { x: p.clientX, y: p.clientY, axis: null, dx: 0, samples: [{ x: p.clientX, t: performance.now() }] };
    };
    /** @param {TouchEvent} e */
    const onMove = (e) => {
      if (!g) return;
      const p = e.touches[0];
      const dx = p.clientX - g.x;
      const dy = p.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
        if (g.axis === "x") {
          g.main = visibleMain();
          g.nav = visibleNav();
          g.navInMain = !!(g.main && g.nav && g.main.contains(g.nav));
        }
      }
      if (g.axis !== "x") return;
      e.preventDefault(); // no vertical scroll while swiping sideways
      const target = index + (dx < 0 ? 1 : -1);
      g.dx = target < 0 || target >= tabs.length ? dx * EDGE_RESISTANCE : dx;
      const now = performance.now();
      g.samples.push({ x: p.clientX, t: now });
      while (g.samples.length > 2 && now - g.samples[0].t > 100) g.samples.shift();
      place(g.dx);
    };
    const onEnd = () => {
      const s = g;
      g = null;
      if (!s || s.axis !== "x" || !s.main) return;
      const first = s.samples[0];
      const last = s.samples[s.samples.length - 1];
      const speed = Math.abs((last.x - first.x) / Math.max(1, last.t - first.t));
      const target = index + (s.dx < 0 ? 1 : -1);
      const go = target >= 0 && target < tabs.length && (Math.abs(s.dx) > window.innerWidth * FLIP_RATIO || (speed > FLICK_SPEED && Math.abs(s.dx) > 40));
      if (!go) {
        g = s;
        place(0, 220);
        g = null;
        clear(s.main, s.nav, 240);
        return;
      }
      anchorTabBar();
      router.push(tabs[target].href, { transitionTypes: [s.dx < 0 ? "nav-forward" : "nav-back"] });
      clear(s.main, s.nav, 600); // the old page is hidden by then; reset it for next time
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [index, tabs, router]);
}
