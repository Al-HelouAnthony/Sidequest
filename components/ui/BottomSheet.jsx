"use client";
/**
 * Bottom sheet built on the native <dialog> element (showModal), so focus trapping,
 * Escape-to-close, inert background and focus return come from the browser.
 * Cel style: a paper island rising from the bottom, ink outline, springy entrance.
 *
 * Controlled: the parent owns `open` and closes it in `onClose`
 * (fired by the ✕ button, Escape, or a tap on the backdrop).
 */
import { useEffect, useId, useRef } from "react";
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
  const titleId = useId();
  const descId = useId();

  // Sync the `open` prop with the imperative dialog API.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
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
        "backdrop:bg-[#22282e]/55 motion-safe:backdrop:animate-fade-in",
        className,
      )}
    >
      <div aria-hidden="true" className="flex justify-center pt-3">
        <span className="h-1.5 w-11 rounded-full bg-ink/25" />
      </div>

      <header className="flex items-start gap-3 px-5 pt-2 pb-3">
        <div className="min-w-0 flex-1 pt-1">
          <h2 id={titleId} className="font-display text-2xl leading-[1.05] font-extrabold">
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

      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5", footer ? "pb-4" : "pb-safe")}>
        {children}
      </div>

      {footer && <div className="border-t-[1.5px] border-line/15 px-5 pt-3 pb-safe">{footer}</div>}
    </dialog>
  );
}
