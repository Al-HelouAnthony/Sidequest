"use client";
/**
 * Natural-language search (PLAN.md F10). Owner: Oscar.
 * "something cheap with Maya tomorrow night" → POST /api/search { query } (Mhammad: Claude turns it into
 * FeedFilters and runs the engine) → SearchResponse { filters, summary, cards, nextCursor } → onResult.
 * 422 = Claude couldn't turn it into filters: ask to rephrase instead of showing an error.
 */
import { useState } from "react";
import { SearchResponse } from "@/types/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing } from "@/components/ui/classes";

/** Tap-to-try queries (the first one is the demo line in PLAN.md §8). */
const EXAMPLES = ["something cheap with Maya tomorrow night", "coffee this weekend", "outdoors with Karim on Saturday"];

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
        return;
      }
      if (!res.ok) throw new Error(`search ${res.status}`);
      const parsed = SearchResponse.safeParse(await res.json());
      if (!parsed.success) {
        console.error("[search] response does not match SearchResponse", parsed.error.issues);
        throw new Error("bad shape");
      }
      onResult(parsed.data, q);
    } catch (e) {
      console.error("[search]", e);
      setError("Search didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title="What are you up for?"
      description="Say it like you'd text a friend."
    >
      <form
        role="search"
        className="space-y-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <label className="block">
          <span className="sr-only">Search</span>
          <span
            className={cn(
              "cel flex min-h-14 items-center gap-2 rounded-tile px-3",
              "focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-accent",
            )}
          >
            <Icon name="search" cel strokeWidth={2} className="size-5 shrink-0" />
            <input
              data-autofocus
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              maxLength={300}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="something cheap with Maya tomorrow night"
              className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-ink-muted"
            />
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={busy} disabled={!query.trim()}>
          {busy ? "Searching…" : "Search"}
        </Button>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-muted">Try</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={busy}
                onClick={() => run(ex)}
                className={cn("rounded-full disabled:opacity-55", focusRing)}
              >
                <Chip>{ex}</Chip>
              </button>
            ))}
          </div>
        </div>
      </form>
    </BottomSheet>
  );
}

/**
 * What the search understood, as chips ("Cheap" · "with Maya" · "Sat night"), plus ✕ Clear.
 * @param {{ summary: string, onClear: () => void, onEdit: () => void }} props
 */
export function SearchSummary({ summary, onClear, onEdit }) {
  const parts = summary
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 pb-2 scrollbar-none" aria-label="Search filters">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit search: ${summary}`}
        className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full", focusRing)}
      >
        {parts.map((p) => (
          <Chip key={p} selected>
            {p}
          </Chip>
        ))}
      </button>
      <Chip onRemove={onClear} removeLabel="Clear search" className="shrink-0">
        Clear
      </Chip>
    </div>
  );
}
