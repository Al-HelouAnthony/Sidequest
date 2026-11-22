"use client";
/**
 * Feed screen. Owner: Oscar (PLAN.md F2/F3).
 * Full-screen snap scroll of FeedCards from GET /api/feed, more pages as you reach the end.
 * Skip and Save are optimistic (UI first, then POST /api/interactions).
 * Let's go (SwipeToGo) → InviteSheet → POST /api/plans → /plans/[id]. ⓘ → WhySheet (score breakdown).
 * Search pill → SearchSheet → POST /api/search: results replace the feed until "Clear" (F10).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageTransition } from "@/components/nav/PageTransition";
import { FeedResponse } from "@/types";
import { FeedCard, FeedCardSkeleton } from "@/components/feed/FeedCard";
import { InviteBanner } from "@/components/plans/InviteBanner";
import { InviteSheet } from "@/components/plans/InviteSheet";
import { WhySheet } from "@/components/feed/WhySheet";
import { SearchSheet, SearchSummary } from "@/components/feed/SearchSheet";
import { PlaceSheet } from "@/components/feed/PlaceSheet";
import { WeatherSheet } from "@/components/feed/WeatherSheet";
import { FEED_HEADER_REM, FeedHeader } from "@/components/feed/FeedHeader";
import { FEED_RESELECT_EVENT, TAB_BAR_SPACE, TabBar } from "@/components/nav/TabBar";
import { addVisitParams, newSeed, readSeen, rememberSeen } from "@/components/feed/visit";
import { usePager } from "@/components/feed/usePager";
import { AppBackground } from "@/components/ui/AppBackground";
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
 * @param {{ seed: number, seen: string[] }} [visit] N2: per-visit seed + places seen in earlier visits
 * @returns {Promise<import("@/types/api").FeedResponseT>}
 */
async function fetchFeed(cursor, signal, filters, visit) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (visit) addVisitParams(params, visit);
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
 * The feed survives tab switches. Next 16 keeps up to 3 routes alive (hidden with <Activity>, effects re-run
 * when shown again) and fully remounts older ones; we have 4 tabs. So we keep (a) the loaded cards and the
 * card you were on in this module, for remounts, and (b) never refetch page 1 just because the page is shown
 * again. Refresh, search, "Clear" and Friends → "ideas with X" still start from the top.
 */
const FEED_MEMORY_MS = 30 * 60_000;
/**
 * @type {{ cards: import("@/types/feed").FeedCardT[], nextCursor: string | null, saved: string[],
 *   search: { query: string, summary: string } | null, filters: import("@/types/feed").FeedFiltersT | null,
 *   visit: { seed: number, seen: string[] } | null, index: number, cardId: string | null, at: number } | null}
 */
let feedMemory = null;
/** Only read on the client after an earlier visit (null on the server, so no Date.now() while prerendering). */
const recallFeed = () => (feedMemory && Date.now() - feedMemory.at < FEED_MEMORY_MS ? feedMemory : null);

/** Cards ahead of the end of the list at which the next page starts loading (N3). */
const PREFETCH_AHEAD = 5;

/**
 * Warm the browser cache with a page's photos so each card arrives with its image (N3).
 * @param {import("@/types/feed").FeedCardT[]} cards
 */
function preloadPhotos(cards) {
  for (const c of cards) {
    const img = new Image();
    img.decoding = "async";
    img.src = c.place.photoUrl;
  }
}

/** Interactions go out one after another (the server's weight update is read → change → write). */
let interactionQueue = Promise.resolve();

/**
 * Fire-and-forget interaction (the engine learns from these). The UI never waits for it.
 * Queued so quick skips don't overlap and overwrite each other's learning.
 * @param {import("@/types/feed").FeedCardT} card
 * @param {"skip" | "save" | "go"} action
 */
function sendInteraction(card, action) {
  const body = JSON.stringify({ placeId: card.place.id, slotStart: card.slot.start, action });
  interactionQueue = interactionQueue.then(() =>
    fetch("/api/interactions", { method: "POST", headers: { "content-type": "application/json" }, body })
      .then(() => undefined)
      .catch((e) => console.warn("[feed] interaction not sent", e)),
  );
}

/**
 * One full-screen snap page. `placeId` marks card pages so the feed can remember what was actually seen (N2).
 * @param {{ children: React.ReactNode, placeId?: string, cardId?: string }} props
 */
function Page({ children, placeId, cardId }) {
  return (
    <section
      data-place-id={placeId}
      data-card-id={cardId}
      className="h-full px-3 pt-1"
      style={{ paddingBottom: TAB_BAR_SPACE }}
    >
      {children}
    </section>
  );
}

function Feed() {
  /** The feed as it was when you left it (remount after a tab switch), or null. */
  const [restored] = useState(recallFeed);
  const [cards, setCards] = useState(/** @type {import("@/types/feed").FeedCardT[]} */ (restored?.cards ?? []));
  const [nextCursor, setNextCursor] = useState(/** @type {string | null} */ (restored?.nextCursor ?? null));
  const [status, setStatus] = useState(/** @type {"loading" | "ready" | "error"} */ (restored ? "ready" : "loading"));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [saved, setSaved] = useState(() => new Set(/** @type {string[]} */ (restored?.saved ?? [])));
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
  const [search, setSearch] = useState(/** @type {{ query: string, summary: string } | null} */ (restored?.search ?? null));
  const [searchOpen, setSearchOpen] = useState(0);
  /** Filters of the active search, reused for the next pages and for Refresh. */
  const filtersRef = useRef(/** @type {import("@/types/feed").FeedFiltersT | null} */ (restored?.filters ?? null));
  /**
   * N2: one seed per visit + the places seen BEFORE this visit (snapshot), reused for every page.
   * Created on first use inside effects/handlers, never during render: Next 16 (cacheComponents) refuses
   * Math.random() while prerendering.
   */
  const visitRef = useRef(/** @type {{ seed: number, seen: string[] } | null} */ (restored?.visit ?? null));
  /** reloadKey whose first page is on screen: the page being shown again (or restored) doesn't refetch. */
  const loadedKey = useRef(restored ? 0 : -1);
  /** The card on screen (index + id), kept up to date while scrolling, restored when you come back. */
  const posRef = useRef({ index: restored?.index ?? 0, cardId: restored?.cardId ?? null });
  const getVisit = () => (visitRef.current ??= { seed: newSeed(), seen: readSeen() });
  const router = useRouter();
  /** Invites from friends that I haven't answered (polling GET /api/plans). */
  const { invites, dismiss: dismissInvite } = useInvites();
  /** Text of the Refresh pill, or null when hidden. Shown after 2 skips so the learning is visible. */
  const [refreshHint, setRefreshHint] = useState(/** @type {string | null} */ (null));
  /** Skips per category since the last refresh. */
  const skipCounts = useRef(/** @type {Map<string, number>} */ (new Map()));

  const scrollerRef = useRef(/** @type {HTMLElement | null} */ (null));
  const sentinelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  // One card per gesture with a cubic ease-out (Reels-style), instead of the browser's snap.
  usePager(scrollerRef);

  // First page (and retries). Not when the page is only being shown again after a tab switch.
  useEffect(() => {
    if (loadedKey.current === reloadKey) return;
    const ctrl = new AbortController();
    fetchFeed(null, ctrl.signal, filtersRef.current, getVisit())
      .then((d) => {
        loadedKey.current = reloadKey;
        posRef.current = { index: 0, cardId: d.cards[0]?.id ?? null };
        setCards(d.cards);
        preloadPhotos(d.cards.slice(1));
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

  // Remember the feed for a remount (see feedMemory).
  useEffect(() => {
    if (status !== "ready") return;
    feedMemory = {
      cards,
      nextCursor,
      saved: [...saved],
      search,
      filters: filtersRef.current,
      visit: visitRef.current,
      ...posRef.current,
      at: Date.now(),
    };
  }, [status, cards, nextCursor, saved, search]);

  // Back on the feed (shown again or remounted): jump to the card you were on, then track it while scrolling.
  // A layout effect, so it runs before paint (no flash of card 1) and before usePager's effect.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { index, cardId } = posRef.current;
    const target = cardId ? el.querySelector(`section[data-card-id="${CSS.escape(cardId)}"]`) : null;
    if (target) el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top;
    else if (index > 0) el.scrollTop = index * el.clientHeight;
    const onScroll = () => {
      if (!el.clientHeight) return; // hidden
      const i = Math.round(el.scrollTop / el.clientHeight);
      const section = /** @type {HTMLElement | undefined} */ (el.querySelectorAll("section")[i]);
      posRef.current = { index: i, cardId: section?.dataset.cardId ?? null };
      if (feedMemory) Object.assign(feedMemory, posRef.current, { at: Date.now() });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const retry = () => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  };

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const d = await fetchFeed(nextCursor, undefined, filtersRef.current, getVisit());
      setCards((list) => {
        const seen = new Set(list.map((c) => c.id));
        const fresh = d.cards.filter((c) => !seen.has(c.id));
        preloadPhotos(fresh);
        return [...list, ...fresh];
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

  // Load the next page early: when the card PREFETCH_AHEAD from the end comes into view (N3).
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

  // N2: remember places whose card was actually seen (60% on screen), for the next visits' "seen" list.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = /** @type {HTMLElement} */ (e.target).dataset.placeId;
          if (e.isIntersecting && id) rememberSeen(id);
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("section[data-place-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [cards]);

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

  // Friends tab → /feed?with=<id>&name=<name>: show only ideas with that friend (same UI as a search).
  // Read after mount (and each time this kept-alive page is shown again), then drop the params from the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const friendId = params.get("with");
      if (!friendId) return;
      const label = `with ${params.get("name") || "a friend"}`;
      window.history.replaceState(null, "", "/feed");
      filtersRef.current = { friendIds: [friendId] };
      setSearch({ query: label, summary: label });
      skipCounts.current = new Map();
      setRefreshHint(null);
      scrollerRef.current?.scrollTo({ top: 0 });
      setStatus("loading");
      setReloadKey((k) => k + 1);
    }, 0);
    return () => clearTimeout(t);
  }, []);

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

  // Feed tab tapped while the feed is open: a new visit (new shuffle, places just seen move down), from the top.
  // With a search on, it goes back to the normal feed.
  const reselectRef = useRef(() => {});
  useEffect(() => {
    reselectRef.current = () => {
      if (search) return clearSearch();
      visitRef.current = null;
      refresh();
    };
  });
  useEffect(() => {
    const onReselect = () => reselectRef.current();
    window.addEventListener(FEED_RESELECT_EVENT, onReselect);
    return () => window.removeEventListener(FEED_RESELECT_EVENT, onReselect);
  }, []);

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
    <>
    <AppBackground />
    <div className="relative z-10 mx-auto flex h-dvh w-full max-w-md flex-col">
      <FeedHeader onSearch={() => setSearchOpen((n) => n + 1)} />
      {search && (
        <SearchSummary summary={search.summary} onClear={clearSearch} onEdit={() => setSearchOpen((n) => n + 1)} />
      )}
      <main
        ref={scrollerRef}
        aria-label="Suggestions"
        className="min-h-0 flex-1 touch-pan-x overflow-y-hidden overscroll-contain scrollbar-none"
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
            <FeedCardSkeleton />
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
            <Page key={card.id} placeId={card.place.id} cardId={card.id}>
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
              {i === Math.max(0, cards.length - PREFETCH_AHEAD) && <div ref={sentinelRef} aria-hidden="true" />}
            </Page>
          ))}

        {status === "ready" && loadingMore && (
          <Page>
            <span className="sr-only">Loading more…</span>
            <FeedCardSkeleton />
          </Page>
        )}

        {status === "ready" && moreFailed && !loadingMore && (
          <Page>
            <StateIsland title="Couldn't load more" body="Something went wrong fetching the next ideas.">
              <Button onClick={loadMore}>Try again</Button>
            </StateIsland>
          </Page>
        )}

        {/* N3: never a dead end. The server loops (Anthony), but if it ever has nothing more, offer a refresh. */}
        {status === "ready" && cards.length > 0 && !nextCursor && !loadingMore && !moreFailed && (
          <Page>
            <StateIsland
              title={search ? "That's every match" : "You're all caught up"}
              body={search ? `Those are all the ideas for “${search.query}”.` : "Fresh ideas show up as free time and plans change."}
            >
              <Button variant="secondary" onClick={search ? clearSearch : refresh}>
                {search ? "Back to the feed" : "Refresh"}
              </Button>
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
    </>
  );
}

/**
 * Centered paper island for empty / error states.
 * @param {{ title: string, body: string, children?: React.ReactNode }} props
 */
function StateIsland({ title, body, children }) {
  return (
    <div className="cel flex h-full flex-col items-center justify-center gap-3 rounded-card p-8 text-center">
      <h2 className="font-display text-card-title font-extrabold">{title}</h2>
      <p className="max-w-64 text-ink-muted">{body}</p>
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}

export default function FeedPage() {
  return (
    <PageTransition>
      <ToastProvider>
        <Feed />
      </ToastProvider>
    </PageTransition>
  );
}
