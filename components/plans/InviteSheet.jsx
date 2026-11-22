"use client";
/**
 * Invite sheet (PLAN.md F5). Owner: Oscar.
 * Opens after the SwipeToGo bar breaks on a feed card. Lists the friends who are free for the whole slot,
 * all pre-selected (tap to toggle), then POST /api/plans and hands the new plan to `onCreated`.
 */
import { useState } from "react";
import { PlanResponse } from "@/types/api";
import { formatSlot } from "@/lib/time";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing, pressable } from "@/components/ui/classes";

/**
 * @param {{
 *   card: import("@/types/feed").FeedCardT | null,
 *   onClose: () => void,
 *   onCreated: (plan: import("@/types/api").PlanViewT) => void,
 * }} props
 * Open while `card` is set. Remount per card (key={card.id}) so the selection starts fresh.
 */
export function InviteSheet({ card, onClose, onCreated }) {
  const [selected, setSelected] = useState(() => new Set(card?.friends.map((f) => f.id) ?? []));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  if (!card) return null;
  const { place, slot, friends } = card;
  const count = selected.size;

  const toggle = (/** @type {string} */ id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (count === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placeId: place.id, start: slot.start, end: slot.end, inviteeIds: [...selected] }),
      });
      const json = await res.json().catch(() => ({}));
      // 409 (Mhammad): someone ticked is busy at that time, e.g. "Maya isn't free then". Say who; nothing was sent.
      if (res.status === 409) {
        setError(`${json.error ?? "Someone isn't free then"}. Untick them to invite the others.`);
        setSending(false);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? `Couldn't send (${res.status})`);
      onCreated(PlanResponse.parse(json).plan);
    } catch (e) {
      console.error("[invite]", e);
      setError("Couldn't send the invite. Try again.");
      setSending(false);
    }
  };

  return (
    <BottomSheet
      open
      onClose={sending ? () => {} : onClose}
      title="Who's coming?"
      description={
        <>
          {place.name} · {formatSlot(slot.start, slot.end)}
        </>
      }
      footer={
        <div className="space-y-2">
          {error && (
            <p role="alert" className="text-center text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <Button
            size="lg"
            fullWidth
            loading={sending}
            disabled={count === 0}
            onClick={send}
            trailingIcon={!sending && <Icon name="arrowRight" strokeWidth={2.5} className="size-4" />}
          >
            {count === 0 ? "Pick at least one friend" : `Send invite to ${count} ${count === 1 ? "friend" : "friends"}`}
          </Button>
        </div>
      }
    >
      {friends.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">Nobody else is free for this slot. Try another card.</p>
      ) : (
        <>
          <p className="pb-2 text-sm font-semibold text-ink-muted">Free for the whole slot</p>
          <ul className="space-y-2 pb-2">
            {friends.map((f) => {
              const on = selected.has(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(f.id)}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-tile border-2 border-line px-3 py-2 text-left",
                      on ? "bg-teal/25" : "bg-surface",
                      pressable,
                      focusRing,
                    )}
                  >
                    <Avatar src={f.avatarUrl} name={f.name} size="md" decorative />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{f.name}</span>
                      <span className="block text-sm text-ink-muted">
                        {f.travelIsEstimate ? "~" : ""}
                        {f.travelMin} min away
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line",
                        on ? "bg-teal text-on-teal" : "bg-surface",
                      )}
                    >
                      {on && (
                        <span key="on" className="motion-safe:animate-pop">
                          <Icon name="check" strokeWidth={3} className="size-4" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </BottomSheet>
  );
}
