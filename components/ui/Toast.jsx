"use client";
/**
 * Toasts. Wrap a screen in <ToastProvider>, then call useToast().show({...}) anywhere inside it.
 * Shown at the top so they never cover the feed's Skip / Save / Let's go buttons.
 * Cel style: a small paper island that drops in with a bounce.
 *
 *   const toast = useToast();
 *   toast.show({ message: "Skipped Café Olimpico", action: { label: "Undo", onClick: undo } });
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { cn, focusRing, pressable } from "./classes";

/**
 * @typedef {"default" | "success" | "error"} ToastTone
 * @typedef {{ label: string, onClick: () => void }} ToastAction
 * @typedef {{ message: string, tone?: ToastTone, action?: ToastAction, durationMs?: number }} ToastOptions
 * @typedef {{ id: number, message: string, tone: ToastTone, action?: ToastAction }} ToastItem
 * @typedef {{ show: (opts: ToastOptions) => number, dismiss: (id: number) => void }} ToastApi
 */

const ToastContext = createContext(/** @type {ToastApi | null} */ (null));

/** Max toasts on screen at once; older ones drop off. */
const MAX_VISIBLE = 3;

/** @param {{ children: React.ReactNode }} props */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(/** @type {ToastItem[]} */ ([]));
  const timers = useRef(/** @type {Map<number, ReturnType<typeof setTimeout>>} */ (new Map()));
  const nextId = useRef(1);

  const dismiss = useCallback((/** @type {number} */ id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (/** @type {ToastOptions} */ { message, tone = "default", action, durationMs = action ? 5000 : 3000 }) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, message, tone, action }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
      return id;
    },
    [dismiss],
  );

  // Clear pending timers if the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto flex max-w-md flex-col items-center gap-2 px-4 pt-safe"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

const TONE_ICON = {
  default: null,
  success: (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-teal text-on-teal">
      <Icon name="check" strokeWidth={3} className="size-4" />
    </span>
  ),
  error: (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-accent text-on-accent">
      <Icon name="x" strokeWidth={3} className="size-3.5" />
    </span>
  ),
};

/** @param {{ toast: ToastItem, onDismiss: () => void }} props */
function Toast({ toast, onDismiss }) {
  return (
    <div
      className={cn(
        "cel-sm pointer-events-auto flex min-h-14 w-full items-center gap-3 rounded-tile py-1.5 pr-1.5 pl-3.5 text-sm font-semibold text-ink",
        "motion-safe:animate-toast-in",
      )}
    >
      {TONE_ICON[toast.tone]}
      <p className="min-w-0 flex-1">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className={cn(
            "min-h-11 rounded-full px-4 font-bold text-ink underline decoration-accent decoration-2 underline-offset-4 hover:bg-ink/5",
            pressable,
            focusRing,
          )}
        >
          {toast.action.label}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cn("inline-flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-ink/5", pressable, focusRing)}
        >
          <Icon name="x" className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * @returns {ToastApi}
 */
export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() must be used inside <ToastProvider>.");
  return api;
}
