"use client";
/**
 * Natural-language search (PLAN.md F10). Owner: Oscar.
 * "something cheap with Maya tomorrow night" → POST /api/search { query } (Mhammad: lib/ai/search.js turns the
 * words into FeedFilters, Anthony's engine ranks) → SearchResponse { filters, summary, cards, nextCursor } → onResult.
 * 422 = the words couldn't be turned into filters: ask to rephrase (and shake the field) instead of an error.
 *
 * Recent searches (components/feed/searchHistory.js): the last 8 successful queries, newest first; tap to run one
 * again, ✕ to remove it, "Clear all". Loaded after mount (localStorage doesn't exist while prerendering).
 *
 * Cel motion (motion-safe only): contents rise in one after another, history rows press down,
 * the field lifts with a teal cel border + hard shadow on focus, the magnifier wobbles while searching,
 * the field shakes once on a "can't understand", the summary chips pop in one by one.
 */
import { useEffect, useRef, useState } from "react";
import { SearchResponse } from "@/types/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing, pressable } from "@/components/ui/classes";
import { addToHistory, clearHistory, readHistory, removeFromHistory } from "@/components/feed/searchHistory";

/** Stagger for the rise-in, in ms. */
const STEP = 60;

/**
 * @param {{
 *   open: boolean,
 *   initialQuery?: string,
 *   onClose: () => void,
 *   onResult: (result: import("@/types/api").SearchResponseT, query: string) => void,
 * }} props
 * Remount per opening (key) so the field starts from `initialQuery`.
 */
export function SearchSheet({ open, initialQuery = "", onClose, onResult }) {
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** Bumped on a "can't understand" so the field shake replays each time. */
  const [nope, setNope] = useState(0);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  /** Recent searches; null until read from storage after mount. */
  const [history, setHistory] = useState(/** @type {string[] | null} */ (null));

  useEffect(() => {
    // Next tick: keeps the read out of render and out of the effect body (no cascading render warning).
    const t = setTimeout(() => setHistory(readHistory()), 0);
    return () => clearTimeout(t);
  }, []);

  const run = async (/** @type {string} */ text) => {
    const q = text.trim();
    if (!q || busy) return;
    setQuery(q);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (res.status === 422) {
        setError("Couldn't make sense of that. Try something like \"coffee this weekend\".");
        setNope((n) => n + 1);
        return;
      }
      if (!res.ok) throw new Error(`search ${res.status}`);
      const parsed = SearchResponse.safeParse(await res.json());
      if (!parsed.success) {
        console.error("[search] response does not match SearchResponse", parsed.error.issues);
        throw new Error("bad shape");
      }
      setHistory(addToHistory(q)); // only successful searches are remembered
      onResult(parsed.data, q);
    } catch (e) {
      console.error("[search]", e);
      setError("Search didn't work. Try again.");
      setNope((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  /** Rise-in with a stagger (fill-mode "both" keeps it hidden until its turn). */
  const rise = (/** @type {number} */ i) => ({ className: "motion-safe:animate-rise", style: { animationDelay: `${i * STEP}ms` } });

  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title="What are you up for?"
      description="Say it like you'd text a friend."
    >
      <form
        role="search"
        className="space-y-4 pt-1 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <div {...rise(0)}>
          <label className="block">
            <span className="sr-only">Search</span>
            {/* Shake wrapper (re-keyed per "nope") so the field's own lift transition isn't fighting the shake. */}
            <span
              key={nope}
              className={cn("block", nope > 0 && "motion-safe:animate-shake-once")}
              style={{ "--amp": "5px" }}
            >
              <span
                className={cn(
                  // Cel field: ink outline + hard shadow; on focus the outline and shadow turn teal and it lifts.
                  "flex min-h-14 items-center gap-2 rounded-tile border-2 border-line bg-surface pr-1.5 pl-3 shadow-cel",
                  "transition-[transform,box-shadow,border-color] duration-200 ease-out",
                  "focus-within:border-teal focus-within:shadow-[0_5px_0_var(--color-teal)] motion-safe:focus-within:-translate-y-0.5",
                  error && "border-danger",
                )}
              >
                <span className={cn("shrink-0", busy && "motion-safe:animate-scan")} aria-hidden="true">
                  <Icon name="search" cel strokeWidth={2} className="size-5" />
                </span>
                <input
                  ref={inputRef}
                  data-autofocus
                  // type="text" + role="searchbox": no browser-drawn ✕ (Chrome/Safari draw their own on type="search");
                  // screen readers still hear "search", and phone keyboards still show a Search key.
                  type="text"
                  role="searchbox"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  maxLength={300}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="something cheap with Maya tomorrow night"
                  className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-ink-muted"
                />
                {query && !busy && (
                  <button
                    type="button"
                    aria-label="Clear text"
                    onClick={() => {
                      setQuery("");
                      setError(null);
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      "press relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink motion-safe:animate-pop before:absolute before:-inset-1 before:content-['']",
                      focusRing,
                    )}
                  >
                    <Icon name="x" strokeWidth={2.6} className="size-4" />
                  </button>
                )}
              </span>
            </span>
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger motion-safe:animate-rise">
            {error}
          </p>
        )}

        <div {...rise(1)}>
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!query.trim()}>
            {busy ? "Searching…" : "Search"}
          </Button>
        </div>

        <section aria-labelledby="recent-searches" className="space-y-2" {...rise(2)}>
          <h3 id="recent-searches" className="text-label font-bold text-ink-muted">
            Recent searches
          </h3>
          {history !== null && history.length === 0 && (
            <p className="text-sm text-ink-muted">Your searches show up here.</p>
          )}
          {history !== null && history.length > 0 && (
            <>
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(h)}
                      className={cn(
                        // A cel-sm island that sinks when pressed (press = outline, rim, band, hard shadow).
                        "press flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-tile bg-surface px-3.5 text-left text-sm font-semibold text-ink disabled:opacity-55",
                        focusRing,
                      )}
                    >
                      <Icon name="clock" cel strokeWidth={1.9} className="size-5 shrink-0" />
                      <span className="truncate">{h}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${h}`}
                      disabled={busy}
                      onClick={() => setHistory(removeFromHistory(h))}
                      className={cn(
                        "press inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink disabled:opacity-55",
                        focusRing,
                      )}
                    >
                      <Icon name="x" strokeWidth={2.6} className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy}
                onClick={() => setHistory(clearHistory())}
                className={cn(
                  "min-h-11 rounded-full px-1 text-sm font-semibold text-ink-muted underline underline-offset-2 hover:text-ink",
                  focusRing,
                )}
              >
                Clear all
              </button>
            </>
          )}
        </section>
      </form>
    </BottomSheet>
  );
}

/**
 * What the search understood, as chips ("Cheap" · "with Maya" · "Sat night"), plus ✕ Clear.
 * The chips pop in one by one.
 * @param {{ summary: string, onClear: () => void, onEdit: () => void }} props
 */
export function SearchSummary({ summary, onClear, onEdit }) {
  const parts = summary
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 pt-0.5 pb-2 scrollbar-none" aria-label="Search filters">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit search: ${summary}`}
        className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full", pressable, focusRing)}
      >
        {parts.map((p, i) => (
          <span key={p} className="motion-safe:animate-pop" style={{ animationDelay: `${i * 80}ms` }}>
            <Chip selected>{p}</Chip>
          </span>
        ))}
      </button>
      <span className="shrink-0 motion-safe:animate-pop" style={{ animationDelay: `${parts.length * 80}ms` }}>
        <Chip onRemove={onClear} removeLabel="Clear search">
          Clear
        </Chip>
      </span>
    </div>
  );
}
