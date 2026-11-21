"use client";
/**
 * Feed screen. Owner: Oscar (PLAN.md F2/F3).
 * Full-screen snap scroll of FeedCards from GET /api/feed, more pages as you reach the end.
 * Skip and Save are optimistic (UI first, then POST /api/interactions).
 * Let's go (SwipeToGo) → InviteSheet → POST /api/plans → /plans/[id]. ⓘ → WhySheet (score breakdown).
 * Search pill → SearchSheet → POST /api/search: results replace the feed until "Clear" (F10).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedResponse } from "@/types";
import { FeedCard, FeedCardSkeleton } from "@/components/feed/FeedCard";
import { InviteBanner } from "@/components/plans/InviteBanner";
import { InviteSheet } from "@/components/plans/InviteSheet";
import { WhySheet } from "@/components/feed/WhySheet";
import { SearchSheet, SearchSummary } from "@/components/feed/SearchSheet";
import { PlaceSheet } from "@/components/feed/PlaceSheet";
import { WeatherSheet } from "@/components/feed/WeatherSheet";
import { FEED_HEADER_REM, FeedHeader } from "@/components/feed/FeedHeader";
import { TAB_BAR_SPACE, TabBar } from "@/components/nav/TabBar";
import { useInvites } from "@/hooks/useInvites";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ToastProvider } from "@/components/ui/Toast";

/** For the Refresh pill: "Showing fewer bars". */
const CATEGORY_PLURALS = {
  cafe: "cafés",
  restaurant: "restaurants",
  bar: "bars",
  park: "parks",
  viewpoint: "viewpoints",
  activity: "activities",
  event: "events",
};

/** Skip-out animation length. Matches --animate-skip-out in app/globals.css. */
const SKIP_OUT_MS = 280;

/**
 * @param {string | null} cursor
 * @param {AbortSignal} [signal]
 * @param {import("@/types/feed").FeedFiltersT | null} [filters] active search filters (next pages of a search)
 * @returns {Promise<import("@/types/api").FeedResponseT>}
 */
async function fetchFeed(cursor, signal, filters) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (filters && Object.keys(filters).length) params.set("filters", JSON.stringify(filters));
  const qs = params.toString();
  const url = qs ? `/api/feed?${qs}` : "/api/feed";
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
  return (
    <section className="h-full snap-start snap-always px-3 pt-1" style={{ paddingBottom: TAB_BAR_SPACE }}>
      {children}
    </section>
  );
}

function Feed() {
  const [cards, setCards] = useState(/** @type {import("@/types/feed").FeedCardT[]} */ ([]));
  const [nextCursor, setNextCursor] = useState(/** @type {string | null} */ (null));
  const [status, setStatus] = useState(/** @type {"loading" | "ready" | "error"} */ ("loading"));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [saved, setSaved] = useState(() => new Set(/** @type {string[]} */ ([])));
  /** Cards playing the skip-out animation (still rendered, can't be tapped). */
  const [leaving, setLeaving] = useState(() => new Set(/** @type {string[]} */ ([])));
  /** Per-card counter; bumping it puts that card's swipe bar back to the start. */
  const [goResets, setGoResets] = useState(() => new Map(/** @type {[string, number][]} */ ([])));
  const [reloadKey, setReloadKey] = useState(0);
  /** Card whose invite sheet is open (after its swipe bar broke), or null. */
  const [inviteCard, setInviteCard] = useState(/** @type {import("@/types/feed").FeedCardT | null} */ (null));
  /** Card whose "Why am I seeing this?" sheet is open, or null. */
  const [whyCard, setWhyCard] = useState(/** @type {import("@/types/feed").FeedCardT | null} */ (null));
  /** Card whose place-details sheet is open (tap the category chip), or null. */
  const [detailsCard, setDetailsCard] = useState(/** @type {import("@/types/feed").FeedCardT | null} */ (null));
  /** Card whose weather sheet is open (tap the weather badge), or null. */
  const [weatherCard, setWeatherCard] = useState(/** @type {import("@/types/feed").FeedCardT | null} */ (null));
  /** Active search (F10): what was typed + Claude's summary. null = the normal feed. */
  const [search, setSearch] = useState(/** @type {{ query: string, summary: string } | null} */ (null));
  const [searchOpen, setSearchOpen] = useState(0);
  /** Filters of the active search, reused for the next pages and for Refresh. */
  const filtersRef = useRef(/** @type {import("@/types/feed").FeedFiltersT | null} */ (null));
  const router = useRouter();
  /** Invites from friends that I haven't answered (polling GET /api/plans). */
  const { invites, dismiss: dismissInvite } = useInvites();
  /** Text of the Refresh pill, or null when hidden. Shown after 2 skips so the learning is visible. */
  const [refreshHint, setRefreshHint] = useState(/** @type {string | null} */ (null));
  /** Skips per category since the last refresh. */
  const skipCounts = useRef(/** @type {Map<string, number>} */ (new Map()));

  const scrollerRef = useRef(/** @type {HTMLElement | null} */ (null));
  const sentinelRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // First page (and retries).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchFeed(null, ctrl.signal, filtersRef.current)
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
      const d = await fetchFeed(nextCursor, undefined, filtersRef.current);
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

  // Skip timers, cleared if the feed unmounts mid-animation.
  const skipTimers = useRef(/** @type {Set<ReturnType<typeof setTimeout>>} */ (new Set()));
  useEffect(() => {
    const timers = skipTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  /** @param {string} id */
  const removeCard = (id) => {
    setCards((list) => list.filter((c) => c.id !== id));
    setLeaving((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  };

  /** Records a skip; after 2 (since the last refresh) the Refresh pill appears. */
  const noteSkip = (/** @type {import("@/types/domain").CategoryT} */ category) => {
    const counts = skipCounts.current;
    const n = (counts.get(category) ?? 0) + 1;
    counts.set(category, n);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (n >= 2) setRefreshHint(`Showing fewer ${CATEGORY_PLURALS[category] ?? "of those"}`);
    else if (total >= 2) setRefreshHint("Your feed learned");
  };

  /** Search results replace the feed (same cards, same gestures). */
  const applySearch = (/** @type {import("@/types/api").SearchResponseT} */ result, /** @type {string} */ query) => {
    filtersRef.current = result.filters;
    setSearch({ query, summary: result.summary || query });
    setSearchOpen(0);
    setCards(result.cards);
    setNextCursor(result.nextCursor);
    setMoreFailed(false);
    setStatus("ready");
    skipCounts.current = new Map();
    setRefreshHint(null);
    scrollerRef.current?.scrollTo({ top: 0 });
  };

  /** Back to the normal feed. */
  const clearSearch = () => {
    filtersRef.current = null;
    setSearch(null);
    skipCounts.current = new Map();
    setRefreshHint(null);
    scrollerRef.current?.scrollTo({ top: 0 });
    retry();
  };

  /** Re-ranked first page (the engine has learned from the skips). Back to the top. */
  const refresh = () => {
    skipCounts.current = new Map();
    setRefreshHint(null);
    scrollerRef.current?.scrollTo({ top: 0 });
    retry();
  };

  /**
   * Optimistic: the interaction goes out on tap, the card flies off, then leaves the list
   * and the next card snaps into its place. Reduced motion → removed at once.
   * @param {import("@/types/feed").FeedCardT} card
   */
  const skip = (card) => {
    if (leaving.has(card.id)) return;
    sendInteraction(card, "skip");
    noteSkip(card.place.category);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      removeCard(card.id);
      return;
    }
    setLeaving((s) => new Set(s).add(card.id));
    const t = setTimeout(() => {
      skipTimers.current.delete(t);
      removeCard(card.id);
    }, SKIP_OUT_MS);
    skipTimers.current.add(t);
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

  /** The swipe bar broke: open the invite sheet for this card. */
  const go = (/** @type {import("@/types/feed").FeedCardT} */ card) => setInviteCard(card);

  /** Close the invite sheet and put that card's swipe bar back. */
  const closeInvite = () => {
    if (inviteCard) {
      const id = inviteCard.id;
      setGoResets((m) => new Map(m).set(id, (m.get(id) ?? 0) + 1));
    }
    setInviteCard(null);
  };

  /**
   * Plan created: count it as a "go" for the engine (boosts that category), close the sheet, open the plan.
   * Closing first matters: Next keeps this page alive (hidden) after navigating, so a sheet left open
   * would reopen on Back, and its modal would block taps on the plan page.
   */
  const planCreated = (/** @type {import("@/types/api").PlanViewT} */ plan) => {
    if (inviteCard) sendInteraction(inviteCard, "go");
    closeInvite();
    router.push(`/plans/${plan.id}`);
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <FeedHeader onSearch={() => setSearchOpen((n) => n + 1)} />
      {search && (
        <SearchSummary summary={search.summary} onClear={clearSearch} onEdit={() => setSearchOpen((n) => n + 1)} />
      )}
      <main
        ref={scrollerRef}
        aria-label="Suggestions"
        className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-scroll overscroll-contain scrollbar-none"
      >
        {/* Top stack floating over the feed: invite banner (F7), then the Refresh pill.
            The wrapper is a live region so both get announced. */}
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-md flex-col items-center gap-2 px-3 pt-2"
          style={{ top: `calc(${FEED_HEADER_REM}rem + env(safe-area-inset-top))` }}
        >
          {invites[0] && (
            <InviteBanner
              invite={invites[0]}
              moreCount={invites.length - 1}
              onOpen={() => dismissInvite(invites[0].id)}
              onDismiss={() => dismissInvite(invites[0].id)}
              className="pointer-events-auto"
            />
          )}
          {refreshHint && status === "ready" && (
            <Button
              variant="secondary"
              onClick={refresh}
              leadingIcon={<Icon name="refresh" strokeWidth={2.5} className="size-4" />}
              className="pointer-events-auto shadow-cel motion-safe:animate-toast-in"
            >
              {refreshHint} · Refresh
            </Button>
          )}
        </div>

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
            {search ? (
              <StateIsland title="Nothing matches" body={`No free time together for “${search.query}”. Try something broader.`}>
                <Button variant="secondary" onClick={clearSearch}>
                  Clear search
                </Button>
              </StateIsland>
            ) : (
              <StateIsland title="Everyone's busy" body="No shared free time right now. Try again next week.">
                <Button variant="secondary" onClick={retry}>
                  Refresh
                </Button>
              </StateIsland>
            )}
          </Page>
        )}

        {status === "ready" &&
          cards.map((card, i) => (
            <Page key={card.id}>
              <FeedCard
                card={card}
                priority={i === 0}
                saved={saved.has(card.id)}
                leaving={leaving.has(card.id)}
                goResetKey={goResets.get(card.id) ?? 0}
                onSkip={() => skip(card)}
                onSave={() => toggleSave(card)}
                onGo={() => go(card)}
                onWhy={() => setWhyCard(card)}
                onDetails={() => setDetailsCard(card)}
                onWeather={() => setWeatherCard(card)}
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

        {whyCard && <WhySheet key={whyCard.id} card={whyCard} onClose={() => setWhyCard(null)} />}

        {detailsCard && <PlaceSheet key={detailsCard.id} card={detailsCard} onClose={() => setDetailsCard(null)} />}

        {weatherCard && <WeatherSheet key={weatherCard.id} card={weatherCard} onClose={() => setWeatherCard(null)} />}

        {searchOpen > 0 && (
          <SearchSheet
            key={searchOpen}
            open
            initialQuery={search?.query ?? ""}
            onClose={() => setSearchOpen(0)}
            onResult={applySearch}
          />
        )}

        {inviteCard && (
          <InviteSheet key={inviteCard.id} card={inviteCard} onClose={closeInvite} onCreated={planCreated} />
        )}
      </main>
      <TabBar active="/feed" />
    </div>
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
