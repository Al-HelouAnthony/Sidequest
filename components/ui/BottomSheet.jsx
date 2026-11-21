"use client";
/**
 * Bottom sheet built on the native <dialog> element (showModal), so focus trapping,
 * Escape-to-close, inert background and focus return come from the browser.
 * Cel style: a paper island rising from the bottom, ink outline, springy entrance.
 *
 * Controlled: the parent owns `open` and closes it in `onClose`
 * (fired by the ✕ button, Escape, a tap on the backdrop, or dragging the handle/header down).
 *
 * Drag to dismiss: the handle + header are the grab zone (touch-action: none, so it never fights scrolling;
 * the scrolling content keeps working). The sheet follows the finger; past DISMISS_PX or a quick flick it
 * slides away and closes, otherwise it springs back. Buttons in the header (✕) still just click.
 */
import { useEffect, useId, useRef } from "react";

/** Pull distance that closes the sheet (or a quarter of its height, if smaller). */
const DISMISS_PX = 140;
/** A flick this fast (px/ms) closes even on a short pull. */
const FLICK_SPEED = 0.5;
const SPRING_BACK = "transform 320ms cubic-bezier(0.2, 1.3, 0.4, 1)";
const SLIDE_AWAY_MS = 200;
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import { cn } from "./classes";

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title: string,
 *   description?: React.ReactNode,
 *   children: React.ReactNode,
 *   footer?: React.ReactNode,
 *   className?: string,
 * }} props
 * `footer` is pinned under the scrolling content (put the main action there).
 */
export function BottomSheet({ open, onClose, title, description, children, footer, className }) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const downOnBackdrop = useRef(false);
  /** @type {React.RefObject<{ startY: number, lastY: number, lastT: number, v: number, dy: number } | null>} */
  const drag = useRef(null);
  const closeTimer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
  const titleId = useId();
  const descId = useId();

  /** Move the sheet (directly on the element: no re-render per pointer move). */
  const setOffset = (/** @type {number} */ y, /** @type {string} */ transition) => {
    const d = ref.current;
    if (!d) return;
    d.style.transition = transition;
    d.style.transform = y ? `translateY(${y}px)` : "";
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /** @param {React.PointerEvent<HTMLDivElement>} e */
  const onDragStart = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (/** @type {HTMLElement} */ (e.target).closest("button, a, input")) return; // ✕ etc. stay clickable
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, dy: 0 };
  };

  /** @param {React.PointerEvent<HTMLDivElement>} e */
  const onDragMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.dy = Math.max(0, e.clientY - d.startY); // down only
    setOffset(d.dy, "none");
  };

  /** @param {boolean} cancelled the browser took the gesture: spring back, never close */
  const onDragEnd = (cancelled) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const height = ref.current?.offsetHeight ?? 600;
    const dismiss = !cancelled && (d.dy > Math.min(DISMISS_PX, height * 0.25) || (d.v > FLICK_SPEED && d.dy > 24));
    if (!dismiss) {
      setOffset(0, SPRING_BACK);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOffset(0, "none");
      onClose();
      return;
    }
    setOffset(height, `transform ${SLIDE_AWAY_MS}ms cubic-bezier(0.4, 0, 1, 1)`);
    closeTimer.current = setTimeout(onClose, SLIDE_AWAY_MS - 10);
  };

  // Sync the `open` prop with the imperative dialog API.
  // The cleanup closes it when the sheet unmounts OR is hidden: Next 16 (cacheComponents) keeps the
  // previous page alive but hidden after a navigation, and a modal <dialog> left open in that hidden
  // page makes every element on the new page untappable (the "back button does nothing" bug).
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Fresh position (a previous drag-to-close may have left it slid away).
      dialog.style.transform = "";
      dialog.style.transition = "";
      dialog.showModal();
      // showModal focuses the first button (✕). A field marked data-autofocus gets the caret instead, right away,
      // so typing + Enter can't land on ✕ and close the sheet.
      /** @type {HTMLElement | null} */ (dialog.querySelector("[data-autofocus]"))?.focus();
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Escape: keep the dialog open until the parent flips `open`, so state never drifts.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Only close on a real backdrop tap (press AND release outside), not on a drag out of the content.
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
      className={cn(
        "mx-auto mt-auto mb-0 max-h-[88dvh] w-full max-w-md overflow-hidden rounded-t-sheet border-[1.5px] border-b-0 border-line bg-surface p-0 text-ink shadow-float",
        "open:flex open:flex-col motion-safe:open:animate-sheet-up",
        "backdrop:bg-on-accent/55 motion-safe:backdrop:animate-fade-in",
        className,
      )}
    >
      {/* Grab zone: handle + header. Drag down to close (see the file comment). */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={() => onDragEnd(false)}
        onPointerCancel={() => onDragEnd(true)}
        className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
      >
        <div aria-hidden="true" className="flex justify-center pt-3 pb-1">
          <span className="h-1.5 w-11 rounded-full bg-ink/25" />
        </div>

        <header className="flex items-start gap-3 px-5 pt-1 pb-3">
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={titleId} className="font-display text-card-title font-extrabold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" icon={<Icon name="x" strokeWidth={2.5} />} variant="solid" onClick={onClose} />
        </header>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5", footer ? "pb-4" : "pb-safe")}>
        {children}
      </div>

      {footer && <div className="border-t-[1.5px] border-line/15 px-5 pt-3 pb-safe">{footer}</div>}
    </dialog>
  );
}
