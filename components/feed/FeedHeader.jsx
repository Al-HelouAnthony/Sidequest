/**
 * Slim top bar above the feed: the wordmark + the search pill (F10). Owner: Oscar.
 * Navigation (Feed · Plans · You, with the invite badge) lives in the floating glass TabBar.
 */
import { buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Header height without the safe-area inset. The feed's floating stack sits just under it. */
export const FEED_HEADER_REM = 3.5;

/** @param {{ onSearch?: () => void }} props */
export function FeedHeader({ onSearch }) {
  return (
    <header
      className="flex shrink-0 items-center justify-between gap-3 px-4"
      style={{
        height: `calc(${FEED_HEADER_REM}rem + env(safe-area-inset-top))`,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <h1 className="halo font-display text-2xl leading-none font-extrabold tracking-tight">
        Side<span className="text-accent">quest</span>
      </h1>
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          className={buttonClasses({ variant: "secondary", className: "min-w-0 pr-4 pl-3 font-semibold text-ink-muted" })}
        >
          <Icon name="search" cel strokeWidth={2} className="size-5 text-ink" />
          <span className="truncate">Search</span>
        </button>
      )}
    </header>
  );
}
