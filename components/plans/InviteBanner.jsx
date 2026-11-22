"use client";
/**
 * Invite banner (PLAN.md F7). Owner: Oscar. The demo's wow moment: it drops in on the friend's phone
 * a few seconds after "Send invite", no refresh. Tap → the plan page; ✕ → dismiss.
 * Fed by hooks/useInvites.js (polling today, Realtime later).
 */
import { useEffect } from "react";
import Link from "next/link";
import { formatSlot } from "@/lib/time";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing } from "@/components/ui/classes";

/**
 * @param {{
 *   invite: import("@/types/api").PlanViewT,
 *   moreCount?: number,
 *   onOpen?: () => void,
 *   onDismiss: () => void,
 *   className?: string,
 * }} props
 * `moreCount`: other pending invites behind this one ("+1 more").
 */
export function InviteBanner({ invite, moreCount = 0, onOpen, onDismiss, className }) {
  const creator = invite.members.find((m) => m.isCreator);
  const who = creator?.name ?? "A friend";

  // A short buzz when a new invite lands (Android; iOS Safari has no vibration API). Only once the person has
  // touched the page: before that Chrome blocks it and logs "[Intervention] Blocked call to navigator.vibrate".
  useEffect(() => {
    try {
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([20, 40, 20]);
    } catch {
      // not supported
    }
  }, [invite.id]);

  return (
    <div
      key={invite.id}
      className={cn("cel flex w-full items-center gap-1 rounded-tile py-1.5 pr-1.5 pl-2 motion-safe:animate-toast-in", className)}
    >
      <Link
        href={`/plans/${invite.id}`}
        onClick={onOpen}
        className={cn("flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[14px] px-1", focusRing)}
      >
        <span className="relative shrink-0">
          <Avatar src={creator?.avatarUrl} name={who} size="md" decorative />
          <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-accent motion-safe:animate-ping-ring" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {who} invited you
            {moreCount > 0 && <span className="font-semibold text-ink-muted"> · +{moreCount} more</span>}
          </span>
          <span className="block truncate text-sm text-ink-muted">
            <span className="font-semibold text-ink">{invite.place.name}</span> · {formatSlot(invite.startAt, invite.endAt)}
          </span>
        </span>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-accent text-on-accent">
          <Icon name="arrowRight" strokeWidth={2.5} className="size-4" />
        </span>
      </Link>
      <IconButton label="Dismiss invite" variant="ghost" icon={<Icon name="x" strokeWidth={2.5} className="size-4" />} onClick={onDismiss} />
    </div>
  );
}
