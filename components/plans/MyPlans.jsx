"use client";
/**
 * My Plans (PLAN.md F8). Owner: Oscar.
 * Upcoming plans in three groups: invites I haven't answered, confirmed, and waiting for replies.
 * Refreshes every 5 s so RSVPs show up while it's open. Each row opens /plans/[id].
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlansResponse } from "@/types/api";
import { formatSlot } from "@/lib/time";
import { useMeId } from "@/components/plans/useMeId";
import { AvatarStack } from "@/components/ui/Avatar";
import { buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { TAB_BAR_SPACE, TabBar } from "@/components/nav/TabBar";
import { cn, focusRing, pressable } from "@/components/ui/classes";

const POLL_MS = 5000;

/** @typedef {import("@/types/api").PlanViewT} PlanViewT */

export function MyPlans() {
  const meId = useMeId();
  const [plans, setPlans] = useState(/** @type {PlanViewT[] | null} */ (null));
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/plans", { cache: "no-store" });
        if (!res.ok) throw new Error(`plans ${res.status}`);
        const data = PlansResponse.parse(await res.json());
        const now = Date.now();
        if (!alive) return;
        // Upcoming only, soonest first.
        setPlans(
          data.plans
            .filter((p) => Date.parse(p.endAt) > now)
            .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
        );
        setFailed(false);
      } catch (e) {
        console.error("[my-plans]", e);
        if (alive) setFailed(true);
      }
    };
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [reloadKey]);

  /** My row in a plan. */
  const mine = (/** @type {PlanViewT} */ p) => p.members.find((m) => m.userId === meId);
  const visible = (plans ?? []).filter((p) => p.status !== "cancelled" && mine(p)?.rsvp !== "out");
  const invites = visible.filter((p) => mine(p)?.rsvp === "invited");
  const confirmed = visible.filter((p) => p.status === "confirmed" && mine(p)?.rsvp !== "invited");
  const waiting = visible.filter((p) => p.status === "pending" && mine(p)?.rsvp !== "invited");

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-5 px-4 pt-safe" style={{ paddingBottom: TAB_BAR_SPACE }}>
      <h1 className="flex min-h-11 items-center font-display text-3xl font-extrabold">My plans</h1>

      {plans === null && !failed && <ListSkeleton />}

      {failed && plans === null && (
        <div className="cel space-y-3 rounded-card p-8 text-center">
          <h2 className="font-display text-2xl font-extrabold">Couldn&apos;t load your plans</h2>
          <p className="text-ink-muted">Check your connection and try again.</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={buttonClasses()}>
            Try again
          </button>
        </div>
      )}

      {plans !== null && visible.length === 0 && (
        <div className="cel space-y-3 rounded-card p-8 text-center">
          <Icon name="calendar" cel strokeWidth={1.6} className="mx-auto size-14" />
          <h2 className="font-display text-2xl font-extrabold">No plans yet</h2>
          <p className="text-ink-muted">Swipe the orange bar on something you like and invite your friends.</p>
          <Link href="/feed" className={buttonClasses({ size: "lg", className: "mt-1" })}>
            Find something to do
          </Link>
        </div>
      )}

      <Section title="Invites" plans={invites} meId={meId} highlight />
      <Section title="Confirmed" plans={confirmed} meId={meId} />
      <Section title="Waiting for replies" plans={waiting} meId={meId} />

      <TabBar active="/plans" />
    </main>
  );
}

/**
 * @param {{ title: string, plans: PlanViewT[], meId: string | null, highlight?: boolean }} props
 * `highlight`: orange accent for sections that need an answer from me.
 */
function Section({ title, plans, meId, highlight = false }) {
  if (plans.length === 0) return null;
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <h2 id={id} className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-muted uppercase">
        {title}
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-line px-1 text-[11px] text-ink",
            highlight ? "bg-accent text-on-accent" : "bg-surface",
          )}
        >
          {plans.length}
        </span>
      </h2>
      <ul className="space-y-2.5">
        {plans.map((p) => (
          <li key={p.id}>
            <PlanRow plan={p} meId={meId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** @param {{ plan: PlanViewT, meId: string | null }} props */
function PlanRow({ plan, meId }) {
  const creator = plan.members.find((m) => m.isCreator);
  const going = plan.members.filter((m) => m.rsvp === "in");
  const me = plan.members.find((m) => m.userId === meId);
  const sub =
    me?.rsvp === "invited"
      ? `${creator?.name ?? "A friend"} invited you`
      : `${going.length} of ${plan.members.length} in`;

  return (
    <Link
      href={`/plans/${plan.id}?from=plans`}
      className={cn("cel flex items-center gap-3 rounded-tile p-2.5 pr-3", pressable, focusRing)}
    >
      <span className="relative size-16 shrink-0 overflow-hidden rounded-[14px] border-[1.5px] border-line bg-raised">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote place photos */}
        <img src={plan.place.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{plan.place.name}</span>
        <span className="block truncate text-sm tabular-nums">{formatSlot(plan.startAt, plan.endAt)}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
          <AvatarStack people={going.map((m) => ({ id: m.userId, name: m.name, avatarUrl: m.avatarUrl }))} size="sm" max={3} />
          <span className="truncate">{sub}</span>
        </span>
      </span>
      <Icon name="arrowRight" strokeWidth={2.5} className="size-4 shrink-0 text-ink-muted" />
    </Link>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2.5">
      <span className="sr-only">Loading plans…</span>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[88px] rounded-tile" />
      ))}
    </div>
  );
}
