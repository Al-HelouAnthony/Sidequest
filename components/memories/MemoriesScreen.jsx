"use client";
/**
 * Memories: every photo you and your friends took during your sidequests (G4), Snapchat-Memories style.
 *  - Stories row: one ring per outing, newest first → plays that outing's photos full screen.
 *  - Below: months → outings (place, day, who went) → a 3-column grid. Tap a photo → viewer from there.
 * Data: GET /api/memories (members only, signed URLs ≈1 h, so it refetches when you come back to it).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MemoriesResponse } from "@/types/api";
import { toLocal } from "@/lib/time";
import { AvatarStack } from "@/components/ui/Avatar";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Icon } from "@/components/ui/Icon";
import { AppBackground } from "@/components/ui/AppBackground";
import { TAB_BAR_SPACE, TabBar } from "@/components/nav/TabBar";
import { cn, focusRing, pressable } from "@/components/ui/classes";
import { MemoryViewer } from "./MemoryViewer";

/** @typedef {import("@/types/api").MemoriesResponseT["memories"][number]} Memory */

/** "Sat, Nov 21" (Montréal time). @param {string} iso */
export const memoryDay = (iso) => toLocal(iso).toFormat("ccc, LLL d");

/** Memories grouped by month, keeping the newest-first order. @param {Memory[]} memories */
function byMonth(memories) {
  /** @type {{ label: string, items: { memory: Memory, index: number }[] }[]} */
  const months = [];
  memories.forEach((memory, index) => {
    const label = toLocal(memory.startAt).toFormat("LLLL yyyy");
    const last = months[months.length - 1];
    if (last?.label === label) last.items.push({ memory, index });
    else months.push({ label, items: [{ memory, index }] });
  });
  return months;
}

export function MemoriesScreen() {
  const [memories, setMemories] = useState(/** @type {Memory[] | null} */ (null));
  const [failed, setFailed] = useState(false);
  /** Viewer position, or null when closed. `play` = auto-advance (stories row). */
  const [open, setOpen] = useState(/** @type {{ memory: number, photo: number, play: boolean } | null} */ (null));

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/memories", { cache: "no-store" });
      if (!res.ok) throw new Error(`memories ${res.status}`);
      setMemories(MemoriesResponse.parse(await res.json()).memories);
    } catch (e) {
      console.error("[memories]", e);
      setFailed(true);
    }
  }, []);

  // On mount and each time this kept-alive page is shown again (fresh signed URLs, new photos).
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => {
      clearTimeout(t);
      setOpen(null); // never come back to a viewer left open
    };
  }, [load]);

  const total = memories?.reduce((n, m) => n + m.photos.length, 0) ?? 0;

  return (
    <>
      <AppBackground />
      <main className="relative z-10 mx-auto min-h-dvh w-full max-w-md space-y-5 px-4 pt-safe" style={{ paddingBottom: TAB_BAR_SPACE }}>
        <div>
          <h1 className="halo flex min-h-11 items-center font-display text-heading font-extrabold">Memories</h1>
          {memories && memories.length > 0 && (
            <p className="halo text-sm font-semibold text-ink-muted">
              {total} {total === 1 ? "photo" : "photos"} · {memories.length} {memories.length === 1 ? "sidequest" : "sidequests"}
            </p>
          )}
        </div>

        {memories === null && !failed && <MemoriesSkeleton />}

        {failed && memories === null && (
          <div role="alert" className="cel space-y-3 rounded-card p-8 text-center">
            <h2 className="font-display text-card-title font-extrabold">Couldn&apos;t load your memories</h2>
            <p className="text-ink-muted">Check your connection and try again.</p>
            <button type="button" onClick={load} className={buttonClasses()}>
              Try again
            </button>
          </div>
        )}

        {memories !== null && memories.length === 0 && (
          <div className="cel space-y-3 rounded-card p-8 text-center">
            <p className="text-5xl" aria-hidden="true">
              📸
            </p>
            <h2 className="font-display text-card-title font-extrabold">No memories yet</h2>
            <p className="text-ink-muted">
              Photos you and your friends take during a sidequest land here, one story per outing.
            </p>
            <div className="flex flex-col items-center gap-1 pt-1">
              <Link href="/plans" className={buttonClasses({ size: "lg" })}>
                Go to my plans
              </Link>
              <Link href="/plans/preview" className={cn("inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2", focusRing)}>
                See how memories work
              </Link>
            </div>
          </div>
        )}

        {memories && memories.length > 0 && (
          <>
            <section aria-label="Stories">
              <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
                {memories.map((m, i) => (
                  <li
                    key={m.planId}
                    className="w-[76px] shrink-0 motion-safe:animate-pop"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpen({ memory: i, photo: 0, play: true })}
                      aria-label={`Play ${m.place.name}, ${memoryDay(m.startAt)}, ${m.photos.length} ${m.photos.length === 1 ? "photo" : "photos"}`}
                      className={cn("flex w-full flex-col items-center gap-1 rounded-tile", pressable, focusRing)}
                    >
                      <span
                        className="story-ring rounded-full p-[3px] motion-safe:animate-ring-in"
                        style={{ animationDelay: `${120 + i * 70}ms` }}
                      >
                        <span className="block rounded-full border-2 border-line bg-surface p-[2px]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs */}
                          <img src={m.photos[0].url} alt="" className="size-16 rounded-full object-cover" loading="lazy" />
                        </span>
                      </span>
                      <span className="halo w-full truncate text-center text-micro font-bold">{m.place.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {byMonth(memories).map((month) => (
              <section key={month.label} aria-label={month.label} className="space-y-4">
                <h2 className="halo font-display text-xl font-extrabold">{month.label}</h2>
                {month.items.map(({ memory, index }) => (
                  <MemoryGroup
                    key={memory.planId}
                    memory={memory}
                    order={index}
                    onOpen={(photo) => setOpen({ memory: index, photo, play: false })}
                  />
                ))}
              </section>
            ))}
          </>
        )}

        <TabBar active="/memories" />
      </main>

      {open && memories && memories[open.memory] && (
        <MemoryViewer
          memories={memories}
          start={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** @param {{ memory: Memory, order: number, onOpen: (photoIndex: number) => void }} props */
function MemoryGroup({ memory, order, onOpen }) {
  const names = Object.fromEntries(memory.people.map((p) => [p.userId, p.name]));
  return (
    <article
      className="cel space-y-2.5 rounded-tile p-3 motion-safe:animate-rise"
      style={{ animationDelay: `${150 + Math.min(order, 6) * 90}ms` }}
    >
      {/* The whole header opens the plan (details, who went, the album). Photos below open the viewer. */}
      <Link
        href={`/plans/${memory.planId}?from=plans`}
        transitionTypes={["nav-forward"]}
        aria-label={`${memory.place.name}, ${memoryDay(memory.startAt)}: open the plan`}
        className={cn("-m-1 flex items-center gap-3 rounded-[12px] p-1", pressable, focusRing)}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{memory.place.name}</h3>
          <p className="text-sm text-ink-muted">
            {memoryDay(memory.startAt)} · {memory.photos.length} {memory.photos.length === 1 ? "photo" : "photos"}
          </p>
        </div>
        <AvatarStack people={memory.people.map((p) => ({ id: p.userId, name: p.name, avatarUrl: p.avatarUrl }))} size="sm" max={4} />
        <Icon name="arrowRight" strokeWidth={2.5} className="size-4 shrink-0 text-ink-muted" />
      </Link>
      <ul className="grid grid-cols-3 gap-1.5">
        {memory.photos.map((p, i) => (
          <li
            key={p.id}
            className="motion-safe:animate-polaroid-in"
            style={{ animationDelay: `${260 + Math.min(order, 6) * 90 + i * 60}ms`, "--tilt": `${i % 2 ? 5 : -6}deg` }}
          >
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`Open photo ${i + 1} of ${memory.photos.length} by ${names[p.userId] ?? "a friend"}`}
              className={cn(
                "block w-full rounded-[12px] transition-transform duration-200 hover:-rotate-2 hover:scale-[1.03]",
                pressable,
                focusRing,
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs */}
              <img src={p.url} alt="" loading="lazy" className="aspect-[3/4] w-full rounded-[12px] border-2 border-line bg-raised object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

function MemoriesSkeleton() {
  return (
    <div className="space-y-4">
      <span className="sr-only">Loading memories…</span>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="size-[76px] rounded-full" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-tile" />
    </div>
  );
}
