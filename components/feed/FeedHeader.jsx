/**
 * Slim top bar above the feed: wordmark + "My plans" (PLAN.md F8 entry point). Owner: Oscar.
 * The badge counts invites I haven't answered yet (from useInvites in the feed).
 */
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Header height without the safe-area inset. The feed's floating stack sits just under it. */
export const FEED_HEADER_REM = 3.5;

/** @param {{ inviteCount?: number }} props */
export function FeedHeader({ inviteCount = 0 }) {
  return (
    <header
      className="flex shrink-0 items-center justify-between px-4"
      style={{
        height: `calc(${FEED_HEADER_REM}rem + env(safe-area-inset-top))`,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <h1 className="font-display text-2xl leading-none font-extrabold tracking-tight">
        Side<span className="text-accent">quest</span>
      </h1>
      <Link
        href="/plans"
        aria-label={inviteCount ? `My plans, ${inviteCount} new ${inviteCount === 1 ? "invite" : "invites"}` : "My plans"}
        className={buttonClasses({ variant: "secondary", className: "relative pr-4 pl-3.5" })}
      >
        <Icon name="calendar" cel strokeWidth={1.9} className="size-5" />
        My plans
        {inviteCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-line bg-accent px-1 text-[11px] font-bold text-on-accent tabular-nums motion-safe:animate-pop"
          >
            {inviteCount}
          </span>
        )}
      </Link>
    </header>
  );
}
