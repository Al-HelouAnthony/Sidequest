"use client";
/**
 * "Are you sure?" bottom sheet for actions that are hard to undo (remove a friend, cancel a plan). Owner: Oscar.
 * The safe choice ("Keep") is first and the destructive one is the dark button, so a fast tap on the
 * bigger, warmer orange never destroys anything. While `busy`, it can't be dismissed. `error` shows inline.
 */
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   body: React.ReactNode,
 *   confirmLabel: string,
 *   cancelLabel?: string,
 *   busy?: boolean,
 *   error?: string | null,
 *   onConfirm: () => void,
 *   onClose: () => void,
 * }} props
 */
export function ConfirmSheet({ open, title, body, confirmLabel, cancelLabel = "Keep", busy = false, error, onConfirm, onClose }) {
  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <div className="space-y-2">
          {error && (
            <p role="alert" className="text-center text-sm font-semibold text-danger motion-safe:animate-rise">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              variant="dark"
              size="lg"
              className="flex-1"
              loading={busy}
              onClick={onConfirm}
              leadingIcon={<Icon name="x" strokeWidth={2.6} className="size-4 text-danger" />}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="pb-2 leading-snug text-ink-muted">{body}</div>
    </BottomSheet>
  );
}
