"use client";
/**
 * /friends: the Friends tab. Owner: Oscar.
 * For each friend: your next free time together, their travel time and how many ideas fit, plus
 * "Plan something" → /feed?with=<id>&name=<first name> (the feed filtered to that friend).
 * No new endpoint: the free times come from the feed itself: one GET /api/feed per friend, filtered to them
 * (FeedFilters.friendIds), all in parallel; every card lists the friends free in its slot. Friends with no shared slot still show, at the end.
 * Below: add or remove friends (PeopleList, moved here from the You tab).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedResponse, FriendsResponse } from "@/types/api";
import { formatSlot } from "@/lib/time";
import { AppBackground } from "@/components/ui/AppBackground";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { TAB_BAR_SPACE, TabBar } from "@/components/nav/TabBar";
import { PeopleList } from "@/components/onboarding/pickers";

/**
 * @typedef {{ id: string, name: string, avatarUrl: string,
 *   next?: { start: string, end: string, place: string } | null, travelMin: number | null, estimate: boolean, ideas: number, more?: boolean }} FriendRow
 * `next`: undefined = still loading, null = no shared free time.
 */

/** Friends right away (fast), free times later. @param {AbortSignal} signal @returns {Promise<FriendRow[]>} */
async function loadFriendList(signal) {
  const res = await fetch("/api/friends", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`friends ${res.status}`);
  const { friends } = FriendsResponse.parse(await res.json());
  return friends
    .map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl, travelMin: null, estimate: false, ideas: 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {FriendRow[]} friends @param {AbortSignal} signal @returns {Promise<FriendRow[]>} */
async function addFreeTimes(friends, signal) {
  // One feed page filtered to each friend, all at once: every card on it includes that friend.
  const rows = await Promise.all(
    friends.map(async (f) => {
      try {
        const params = new URLSearchParams({ filters: JSON.stringify({ friendIds: [f.id] }) });
        const r = await fetch(`/api/feed?${params}`, { signal, cache: "no-store" });
        if (!r.ok) throw new Error(`feed ${r.status}`);
        const page = FeedResponse.parse(await r.json());
        const first = page.cards.reduce((a, c) => (!a || c.slot.start < a.slot.start ? c : a), /** @type {any} */ (null));
        const me = first?.friends.find((/** @type {{ id: string }} */ x) => x.id === f.id);
        return {
          ...f,
          next: first ? { start: first.slot.start, end: first.slot.end, place: first.place.name } : null,
          travelMin: me ? me.travelMin : null,
          estimate: Boolean(me?.travelIsEstimate),
          ideas: page.cards.length,
          more: Boolean(page.nextCursor),
        };
      } catch (e) {
        if (signal.aborted) throw e;
        console.error("[friends] free time", f.name, e);
        return { ...f, next: null }; // the friend still shows, just without a time
      }
    }),
  );
  return rows.sort((a, b) => {
    if (a.next && b.next) return a.next.start.localeCompare(b.next.start);
    if (a.next || b.next) return a.next ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function FriendsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState(/** @type {FriendRow[] | null} */ (null));
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    loadFriendList(ctrl.signal)
      .then((list) => {
        setRows(list);
        return addFreeTimes(list, ctrl.signal);
      })
      .then(setRows)
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.error("[friends]", e);
        setFailed(true);
      });
    return () => ctrl.abort();
  }, [reloadKey]);

  const plan = (/** @type {FriendRow} */ f) =>
    router.push(`/feed?with=${encodeURIComponent(f.id)}&name=${encodeURIComponent(f.name.split(" ")[0])}`);

  return (
    <>
      <AppBackground />
      <main className="relative z-10 mx-auto min-h-dvh w-full max-w-md space-y-6 px-4 pt-safe" style={{ paddingBottom: TAB_BAR_SPACE }}>
        <header>
          <h1 className="halo font-display text-heading font-extrabold">Friends</h1>
          <p className="halo mt-1 text-ink-muted">Who&apos;s free with you this week.</p>
        </header>

        <section aria-labelledby="friends-free" className="space-y-3">
          <h2 id="friends-free" className="halo font-display text-xl font-extrabold">
            Free with you
          </h2>

          {rows === null && !failed && (
            <div className="space-y-3">
              <span className="sr-only">Loading friends…</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 rounded-tile" />
              ))}
            </div>
          )}

          {failed && (
            <div className="cel space-y-3 rounded-tile p-4 text-center">
              <p className="font-bold">Couldn&apos;t load your friends</p>
              <p className="text-sm text-ink-muted">Check your connection and try again.</p>
              <Button
                onClick={() => {
                  setFailed(false);
                  setRows(null);
                  setReloadKey((k) => k + 1);
                }}
              >
                Try again
              </Button>
            </div>
          )}

          {rows && rows.length === 0 && (
            <div className="cel rounded-tile p-4 text-center">
              <p className="font-bold">No friends yet</p>
              <p className="mt-1 text-sm text-ink-muted">Add a few below to see when you&apos;re free together.</p>
            </div>
          )}

          {rows && rows.length > 0 && (
            <ul className="space-y-3">
              {rows.map((f, i) => (
                <li
                  key={f.id}
                  className="cel flex items-center gap-3 rounded-tile p-3 motion-safe:animate-rise"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <Avatar src={f.avatarUrl} name={f.name} size="lg" decorative />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{f.name}</p>
                    {f.next === undefined ? (
                      <>
                        <span className="sr-only">Finding free time…</span>
                        <Skeleton className="mt-1 h-4 w-40 rounded-full" />
                        <Skeleton className="mt-1.5 h-3 w-32 rounded-full" />
                      </>
                    ) : f.next ? (
                      <>
                        <p className="flex items-center gap-1 text-sm font-semibold">
                          <Icon name="clock" cel strokeWidth={1.9} className="size-4 shrink-0" />
                          <span className="truncate">{formatSlot(f.next.start, f.next.end)}</span>
                        </p>
                        <p className="truncate text-caption text-ink-muted">
                          {f.travelMin !== null && `${f.estimate ? "~" : ""}${f.travelMin} min away · `}
                          {f.ideas}{f.more ? "+" : ""} {f.ideas === 1 && !f.more ? "idea" : "ideas"} together
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-muted">No shared free time this week</p>
                    )}
                  </div>
                  {f.next && (
                    <Button variant="secondary" onClick={() => plan(f)} aria-label={`Plan something with ${f.name}`}>
                      Plan
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="friends-manage" className="space-y-3">
          <h2 id="friends-manage" className="halo font-display text-xl font-extrabold">
            Add or remove
          </h2>
          <PeopleList canRemove />
        </section>

        <TabBar active="/friends" />
      </main>
    </>
  );
}
