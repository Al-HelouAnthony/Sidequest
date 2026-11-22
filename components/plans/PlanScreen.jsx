"use client";
/**
 * Plan screen (PLAN.md F6). Owner: Oscar.
 * Place, time, who's in, and I'm in / Can't make it for invitees. Live through usePlan() (Mhammad):
 * polling today, Realtime later, same shape. Confetti when the plan flips to confirmed while you watch.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { formatSlot } from "@/lib/time";
import { usePlan } from "@/hooks/usePlan";
import { useMeId } from "@/components/plans/useMeId";
import { AppBackground } from "@/components/ui/AppBackground";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn, focusRing } from "@/components/ui/classes";
import { CATEGORY_LABELS, HoursNotVerified } from "@/components/feed/FeedCard";
import { startsLabel } from "@/components/feed/events";
import { BookItSheet } from "@/components/plans/BookItSheet";
import { LiveLocation } from "@/components/plans/LiveLocation";
import { PlanPhotos } from "@/components/plans/PlanPhotos";

const STATUS = {
  pending: { label: "Waiting for replies", className: "bg-warning text-on-accent" },
  confirmed: { label: "Confirmed", className: "bg-teal text-on-teal" },
  cancelled: { label: "Cancelled", className: "bg-raised text-ink" },
};

const RSVP = {
  in: { label: "In", className: "bg-teal text-on-teal" },
  invited: { label: "Invited", className: "bg-surface text-ink-muted" },
  out: { label: "Can't make it", className: "bg-raised text-ink" },
};

/** Where the plan page's Back goes. */
const BACK = {
  feed: { href: "/feed", label: "Back to the feed" },
  plans: { href: "/plans", label: "Back to my plans" },
  memories: { href: "/memories", label: "Back to memories" },
};

/** @param {{ planId: string, back?: { href: string, label: string } }} props */
export function PlanScreen({ planId, back = BACK.feed }) {
  const { plan, loading, error, rsvp } = usePlan(planId);
  const meId = useMeId();
  const [sending, setSending] = useState(/** @type {"in" | "out" | null} */ (null));
  const [rsvpError, setRsvpError] = useState(/** @type {string | null} */ (null));
  // Cancel (organizer): POST /api/plans/[id]/cancel (proposed endpoint; 404/405 = not live yet → says so).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(/** @type {string | null} */ (null));
  /** Cancelled from this screen: shown right away, before usePlan's next refresh confirms it. */
  const [cancelledHere, setCancelledHere] = useState(false);
  // N4 Book it (organizer, confirmed plan). requestedHere = shown before usePlan's next refresh.
  const [bookOpen, setBookOpen] = useState(false);
  const [requestedHere, setRequestedHere] = useState(false);

  // Confetti when the status flips to confirmed while the screen is open (not when it loads confirmed).
  const [lastStatus, setLastStatus] = useState(/** @type {string | null} */ (null));
  const [celebrate, setCelebrate] = useState(0);
  if (plan && plan.status !== lastStatus) {
    if (lastStatus && plan.status === "confirmed") setCelebrate((n) => n + 1);
    setLastStatus(plan.status);
  }

  const answer = async (/** @type {"in" | "out"} */ value) => {
    setSending(value);
    setRsvpError(null);
    try {
      await rsvp(value);
    } catch (e) {
      console.error("[plan] rsvp", e);
      setRsvpError("Couldn't save your answer. Try again.");
    } finally {
      setSending(null);
    }
  };

  const cancelPlan = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/cancel`, { method: "POST" });
      if (res.status === 404 || res.status === 405) {
        setCancelError("Cancelling plans isn't available yet.");
        return;
      }
      if (!res.ok) throw new Error(`cancel ${res.status}`);
      setCancelledHere(true);
      setCancelOpen(false);
    } catch (e) {
      console.error("[plan] cancel", e);
      setCancelError("Couldn't cancel the plan. Try again.");
    } finally {
      setCancelling(false);
    }
  };

  if (!plan) {
    return (
      <Shell>
        {loading || !error ? (
          <PlanSkeleton />
        ) : (
          <div className="cel space-y-3 rounded-card p-8 text-center">
            <h1 className="font-display text-heading font-extrabold">Plan not found</h1>
            <p className="text-ink-muted">It may have been cancelled, or you&apos;re not invited to it.</p>
            <Link href="/feed" className={cn("press inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-bold text-on-accent", focusRing)}>
              Back to the feed
            </Link>
          </div>
        )}
      </Shell>
    );
  }

  const me = plan.members.find((m) => m.userId === meId);
  const isInvitee = Boolean(me && !me.isCreator);
  const members = [...plan.members].sort((a, b) => Number(b.isCreator) - Number(a.isCreator));
  const inCount = plan.members.filter((m) => m.rsvp === "in").length;
  const planStatus = cancelledHere ? "cancelled" : plan.status;
  /** userId → first name (live location + photo captions). */
  const firstNames = Object.fromEntries(plan.members.map((m) => [m.userId, m.name.split(" ")[0]]));
  /** Events: exact start (contract: PlanView.place.startsAt, optional). */
  const startsAt = /** @type {{ startsAt?: string }} */ (plan.place).startsAt;
  const status = STATUS[planStatus];
  const invitedCount = plan.members.filter((m) => !m.isCreator).length;

  return (
    <Shell>
      {celebrate > 0 && <Confetti key={celebrate} />}
      <p aria-live="polite" className="sr-only">
        {plan.status === "confirmed" ? "Plan confirmed" : ""}
      </p>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={back.href}
          transitionTypes={["nav-back"]}
          aria-label={back.label}
          className={cn("press inline-flex size-11 items-center justify-center rounded-full bg-surface text-ink", focusRing)}
        >
          <Icon name="back" strokeWidth={2.5} />
        </Link>
        <span
          key={planStatus}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-line px-3 text-sm font-bold motion-safe:animate-pop",
            status.className,
          )}
        >
          {planStatus === "confirmed" && <Icon name="check" strokeWidth={3} className="size-4" />}
          {status.label}
        </span>
      </div>

      {/* Place hero */}
      <div className="relative isolate h-56 overflow-hidden rounded-card border-2 border-line bg-ink shadow-cel">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote place photos */}
        <img src={plan.place.photoUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
        <div className="flex h-full flex-col justify-end gap-2 p-4 text-white">
          <span className="glass-photo inline-flex h-7 w-fit items-center rounded-full px-3 text-xs font-semibold">
            {CATEGORY_LABELS[/** @type {keyof typeof CATEGORY_LABELS} */ (plan.place.category)] ?? plan.place.category}
          </span>
          <h1 className="ink-pop font-display text-heading font-extrabold break-words">{plan.place.name}</h1>
        </div>
      </div>

      {/* When + where */}
      <div className="cel space-y-2 rounded-tile p-4">
        <p className="flex items-center gap-2 font-bold tabular-nums">
          <Icon name="clock" cel strokeWidth={1.9} className="size-5" />
          {formatSlot(plan.startAt, plan.endAt)}
        </p>
        {/* Events: the exact start (the plan's own times snap to 30 min). */}
        {startsAt && (
          <p className="flex items-center gap-2 pl-7 text-sm font-semibold">
            {startsLabel(startsAt)}
          </p>
        )}
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Icon name="pin" cel strokeWidth={1.9} className="size-5" />
          {plan.place.address}
        </p>
        {/* Registry restaurants: hours are assumed. Shown here (and in the place sheet), not on feed cards. */}
        {plan.place.hoursVerified === false && <HoursNotVerified />}
      </div>

      {/* Who's in */}
      <section aria-labelledby="whos-in" className="cel rounded-tile p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="whos-in" className="font-display text-xl font-extrabold">
            Who&apos;s in
          </h2>
          <span className="text-sm font-semibold text-ink-muted">
            {inCount} of {plan.members.length} in
          </span>
        </div>
        <ul className="space-y-2.5">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3">
              <Avatar src={m.avatarUrl} name={m.name} size="md" decorative />
              <span className="min-w-0 flex-1 font-semibold">
                {m.name}
                {m.userId === meId && <span className="text-ink-muted"> (you)</span>}
                {m.isCreator && <span className="block text-xs font-medium text-ink-muted">Organizer</span>}
              </span>
              <span
                key={m.rsvp}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border-2 border-line px-2.5 text-xs font-bold motion-safe:animate-pop",
                  RSVP[m.rsvp].className,
                )}
              >
                {m.rsvp === "in" && <Icon name="check" strokeWidth={3} className="size-3.5" />}
                {RSVP[m.rsvp].label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Your answer */}
      {isInvitee && me && planStatus !== "cancelled" && (
        <div className="space-y-2">
          {rsvpError && (
            <p role="alert" className="text-center text-sm font-semibold text-danger">
              {rsvpError}
            </p>
          )}
          {me.rsvp === "invited" ? (
            <div className="flex gap-3">
              <Button variant="secondary" size="lg" className="flex-1" loading={sending === "out"} disabled={sending !== null} onClick={() => answer("out")}>
                Can&apos;t make it
              </Button>
              <Button size="lg" className="flex-1" loading={sending === "in"} disabled={sending !== null} onClick={() => answer("in")}>
                I&apos;m in
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-tile bg-raised px-4 py-2">
              <span className="font-bold">{me.rsvp === "in" ? "You're in 🎉" : "You can't make it"}</span>
              <Button
                variant="ghost"
                loading={sending !== null}
                onClick={() => answer(me.rsvp === "in" ? "out" : "in")}
              >
                {me.rsvp === "in" ? "Can't make it" : "Actually, I'm in"}
              </Button>
            </div>
          )}
        </div>
      )}

      {me?.isCreator && planStatus === "pending" && (
        <p className="halo text-center text-sm text-ink-muted">Invites sent. This updates live when friends answer.</p>
      )}

      {/* G2c: Google Calendar status once I'm going (invitee "in", or organizer of a confirmed plan).
          calendarAdded undefined = unknown (demo users, server still adding it in the background): say nothing. */}
      {planStatus !== "cancelled" && (me?.rsvp === "in" || (me?.isCreator && planStatus === "confirmed")) &&
        (me.calendarAdded === true ? (
          <p role="status" className="halo flex items-center justify-center gap-1.5 text-sm font-semibold motion-safe:animate-rise">
            <Icon name="calendar" cel strokeWidth={1.9} className="size-4" />
            Added to your Google Calendar
            <Icon name="check" strokeWidth={3} className="size-3.5 text-teal" />
          </p>
        ) : me.calendarAdded === false ? (
          <p className="halo text-center text-sm text-ink-muted">
            Not in your Google Calendar yet.{" "}
            <Link
              href={`/login?next=${encodeURIComponent(`/plans/${planId}`)}`}
              className={cn("font-semibold text-ink underline underline-offset-2", focusRing)}
            >
              Reconnect Google
            </Link>
          </p>
        ) : null)}

      {/* G5 live location + G4 memory photos: plan members only, each hides itself outside its time window. */}
      {me && planStatus !== "cancelled" && (
        <>
          <LiveLocation planId={planId} startAt={plan.startAt} meId={meId} names={firstNames} />
          <PlanPhotos planId={planId} startAt={plan.startAt} endAt={plan.endAt} names={firstNames} />
        </>
      )}

      {/* N4 Book it: everyone sees "requested"; the organizer gets the button */}
      {planStatus === "confirmed" &&
        (plan.bookingStatus === "requested" || requestedHere ? (
          <div role="status" className="cel flex items-center gap-3 rounded-tile p-4 motion-safe:animate-rise">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-teal text-on-teal">
              <Icon name="check" strokeWidth={3} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Reservation requested</span>
              <span className="block text-sm text-ink-muted">
                by {members.find((m) => m.isCreator)?.name.split(" ")[0] ?? "the organizer"}
              </span>
            </span>
            {me?.isCreator && (
              <Button variant="ghost" onClick={() => setBookOpen(true)}>
                Details
              </Button>
            )}
          </div>
        ) : (
          me?.isCreator && (
            <Button
              size="lg"
              fullWidth
              onClick={() => setBookOpen(true)}
              leadingIcon={<Icon name="calendar" strokeWidth={2.4} className="size-5" />}
            >
              Book it
            </Button>
          )
        ))}

      {/* Cancelled: one clear card for everyone, with a way back to ideas */}
      {planStatus === "cancelled" && (
        <div role="status" className="cel space-y-2 rounded-tile p-4 text-center motion-safe:animate-rise">
          <p className="font-display text-xl font-extrabold">This plan is off</p>
          <p className="text-sm text-ink-muted">
            {me?.isCreator ? "Everyone you invited sees it's cancelled." : "Nobody's going anymore."} Find something else to do
            together.
          </p>
          <Link href="/feed" className={cn("press mt-1 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-bold text-on-accent", focusRing)}>
            Find something else
          </Link>
        </div>
      )}

      {/* Organizer: cancel the whole plan (invitees use "Can't make it" instead) */}
      {me?.isCreator && planStatus !== "cancelled" && (
        <Button
          variant="night"
          size="lg"
          fullWidth
          onClick={() => {
            setCancelError(null);
            setCancelOpen(true);
          }}
          leadingIcon={
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface text-ink">
              <Icon name="x" strokeWidth={2.8} className="size-3.5" />
            </span>
          }
        >
          Cancel plan
        </Button>
      )}

      <ConfirmSheet
        open={cancelOpen}
        title="Cancel this plan?"
        body={
          <>
            {plan.place.name}, {formatSlot(plan.startAt, plan.endAt)}.{" "}
            {invitedCount === 1 ? "The friend you invited" : `The ${invitedCount} friends you invited`} will see it&apos;s off. This
            can&apos;t be undone, but you can always make a new plan.
          </>
        }
        confirmLabel="Yes, cancel"
        cancelLabel="Keep plan"
        busy={cancelling}
        error={cancelError}
        onConfirm={cancelPlan}
        onClose={() => setCancelOpen(false)}
      />

      {me?.isCreator && (
        <BookItSheet
          planId={planId}
          category={plan.place.category}
          open={bookOpen}
          onClose={() => setBookOpen(false)}
          title={`${plan.place.name} · ${formatSlot(plan.startAt, plan.endAt)}`}
          onRequested={() => setRequestedHere(true)}
        />
      )}
    </Shell>
  );
}

/** Reads the plan id from the URL (/plans/[id]). Must be rendered inside <Suspense>. */
export function PlanFromUrl() {
  const { id } = useParams();
  const from = useSearchParams().get("from");
  const back = from === "plans" ? BACK.plans : from === "memories" ? BACK.memories : BACK.feed;
  return <PlanScreen key={String(id)} planId={String(id)} back={back} />;
}

/** Full-page loading state (also the Suspense fallback). */
export function PlanLoading() {
  return (
    <Shell>
      <PlanSkeleton />
    </Shell>
  );
}

/** @param {{ children: React.ReactNode }} props */
function Shell({ children }) {
  return (
    <>
      <AppBackground />
      <main className="relative z-10 mx-auto min-h-dvh w-full max-w-md space-y-4 px-4 pt-safe pb-safe">{children}</main>
    </>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-4">
      <span className="sr-only">Loading plan…</span>
      <div className="flex justify-between">
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="h-8 w-36 rounded-full" />
      </div>
      <Skeleton className="h-56 rounded-card" />
      <Skeleton className="h-20 rounded-tile" />
      <Skeleton className="h-40 rounded-tile" />
    </div>
  );
}

const CONFETTI_COLORS = ["bg-accent", "bg-teal", "bg-peach", "bg-warning", "bg-ink"];

/** One burst of falling confetti. Motion-safe only; re-key it to replay. */
function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: 32 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "absolute top-0 h-3 w-2 rounded-[2px] border border-line/40 motion-safe:animate-confetti",
            CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          )}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 8) * 70}ms`,
            "--drift": `${((i * 53) % 120) - 60}px`,
            "--spin": `${(i % 2 ? 1 : -1) * (360 + ((i * 97) % 360))}deg`,
          }}
        />
      ))}
    </div>
  );
}
