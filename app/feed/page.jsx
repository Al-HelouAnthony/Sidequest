"use client";
/**
 * Feed screen. Owner: Oscar (PLAN.md F2/F3).
 * Full-screen snap scroll of FeedCards from GET /api/feed, more pages as you reach the end.
 * Skip and Save are optimistic (UI first, then POST /api/interactions).
 * TODO(F3): skip animation · TODO(F4): WhySheet · TODO(F5): InviteSheet on Let's go.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FeedResponse } from "@/types";
import { FeedCard, FeedCardSkeleton } from "@/components/feed/FeedCard";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ui/Toast";

/**
 * @param {string | null} cursor
 * @param {AbortSignal} [signal]
 * @returns {Promise<import("@/types/api").FeedResponseT>}
 */
async function fetchFeed(cursor, signal) {
  const url = cursor ? `/api/feed?cursor=${encodeURIComponent(cursor)}` : "/api/feed";
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Feed failed (${res.status})`);
  const parsed = FeedResponse.safeParse(await res.json());
  if (!parsed.success) {
    // Contract mismatch with the engine: loud in the console so it gets fixed, calm on screen.
    console.error("[feed] /api/feed response does not match FeedResponse", parsed.error.issues);
    throw new Error("The feed came back in an unexpected shape");
  }
  return parsed.data;
}

/**
 * Fire-and-forget interaction (the engine learns from these). The UI never waits for it.
 * @param {import("@/types/feed").FeedCardT} card
 * @param {"skip" | "save" | "go"} action
 */
function sendInteraction(card, action) {
  fetch("/api/interactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ placeId: card.place.id, slotStart: card.slot.start, action }),
  }).catch((e) => console.warn("[feed] interaction not sent", e));
}

/** One full-screen snap page. */
function Page({ children }) {
  return <section className="h-dvh snap-start snap-always px-3 pt-safe pb-safe">{children}</section>;
}

function Feed() {
  const toast = useToast();
  const [cards, setCards] = useState(/** @type {import("@/types/feed").FeedCardT[]} */ ([]));
  const [nextCursor, setNextCursor] = useState(/** @type {string | null} */ (null));
  const [status, setStatus] = useState(/** @type {"loading" | "ready" | "error"} */ ("loading"));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [saved, setSaved] = useState(() => new Set(/** @type {string[]} */ ([])));
  const [reloadKey, setReloadKey] = useState(0);

  const scrollerRef = useRef(/** @type {HTMLElement | null} */ (null));
  const sentinelRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // First page (and retries).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchFeed(null, ctrl.signal)
      .then((d) => {
        setCards(d.cards);
        setNextCursor(d.nextCursor);
        setStatus("ready");
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.error("[feed]", e);
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [reloadKey]);

  const retry = () => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  };

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const d = await fetchFeed(nextCursor);
      setCards((list) => {
        const seen = new Set(list.map((c) => c.id));
        return [...list, ...d.cards.filter((c) => !seen.has(c.id))];
      });
      setNextCursor(d.nextCursor);
    } catch (e) {
      console.error("[feed] load more", e);
      // Stops auto-loading (no retry loop); the last page shows a Retry button instead.
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // Load the next page when the second-to-last card comes into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor || moreFailed) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      root: scrollerRef.current,
      threshold: 0.1,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [nextCursor, loadMore, moreFailed, cards.length]);

  /** @param {import("@/types/feed").FeedCardT} card */
  const skip = (card) => {
    setCards((list) => list.filter((c) => c.id !== card.id));
    sendInteraction(card, "skip");
  };

  /** @param {import("@/types/feed").FeedCardT} card */
  const toggleSave = (card) => {
    const nowSaved = !saved.has(card.id);
    setSaved((s) => {
      const next = new Set(s);
      if (nowSaved) next.add(card.id);
      else next.delete(card.id);
      return next;
    });
    if (nowSaved) sendInteraction(card, "save");
  };

  /** @param {import("@/types/feed").FeedCardT} card */
  const go = (card) => {
    // TODO(F5): open InviteSheet → POST /api/plans → /plans/[id], and send the "go" interaction there.
    toast.show({ message: `Invites for ${card.place.name} are coming soon` });
  };

  return (
    <main
      ref={scrollerRef}
      className="mx-auto h-dvh w-full max-w-md snap-y snap-mandatory overflow-y-scroll overscroll-contain scrollbar-none"
    >
      <h1 className="sr-only">Sidequest feed</h1>

      {status === "loading" && (
        <Page>
          <span className="sr-only">Loading…</span>
          <FeedCardSkeleton className="motion-safe:animate-pulse" />
        </Page>
      )}

      {status === "error" && (
        <Page>
          <StateIsland title="The feed didn't load" body="Check your connection and try again.">
            <Button onClick={retry}>Try again</Button>
          </StateIsland>
        </Page>
      )}

      {status === "ready" && cards.length === 0 && !nextCursor && (
        <Page>
          <StateIsland title="Everyone's busy" body="No shared free time right now. Try again next week.">
            <Button variant="secondary" onClick={retry}>
              Refresh
            </Button>
          </StateIsland>
        </Page>
      )}

      {status === "ready" &&
        cards.map((card, i) => (
          <Page key={card.id}>
            <FeedCard
              card={card}
              priority={i === 0}
              saved={saved.has(card.id)}
              onSkip={() => skip(card)}
              onSave={() => toggleSave(card)}
              onGo={() => go(card)}
            />
            {i === Math.max(0, cards.length - 2) && <div ref={sentinelRef} aria-hidden="true" />}
          </Page>
        ))}

      {status === "ready" && loadingMore && (
        <Page>
          <span className="sr-only">Loading more…</span>
          <FeedCardSkeleton className="motion-safe:animate-pulse" />
        </Page>
      )}

      {status === "ready" && moreFailed && !loadingMore && (
        <Page>
          <StateIsland title="Couldn't load more" body="Something went wrong fetching the next ideas.">
            <Button onClick={loadMore}>Try again</Button>
          </StateIsland>
        </Page>
      )}
    </main>
  );
}

/**
 * Centered paper island for empty / error states.
 * @param {{ title: string, body: string, children?: React.ReactNode }} props
 */
function StateIsland({ title, body, children }) {
  return (
    <div className="cel flex h-full flex-col items-center justify-center gap-3 rounded-card p-8 text-center">
      <h2 className="font-display text-3xl font-extrabold">{title}</h2>
      <p className="max-w-64 text-ink-muted">{body}</p>
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}

export default function FeedPage() {
  return (
    <ToastProvider>
      <Feed />
    </ToastProvider>
  );
}
