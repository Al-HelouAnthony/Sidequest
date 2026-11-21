/**
 * Slim top bar above the feed: the wordmark. Owner: Oscar.
 * Navigation (Feed · Plans · You, with the invite badge) lives in the floating glass TabBar.
 */

/** Header height without the safe-area inset. The feed's floating stack sits just under it. */
export const FEED_HEADER_REM = 3.5;

export function FeedHeader() {
  return (
    <header
      className="flex shrink-0 items-center px-4"
      style={{
        height: `calc(${FEED_HEADER_REM}rem + env(safe-area-inset-top))`,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <h1 className="font-display text-2xl leading-none font-extrabold tracking-tight">
        Side<span className="text-accent">quest</span>
      </h1>
    </header>
  );
}
