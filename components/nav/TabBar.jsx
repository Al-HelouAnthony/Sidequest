"use client";
/**
 * Floating glass tab bar (design-reference/components/GlassTabBar). Owner: Oscar.
 * Frosted glass 12px above the bottom and 12px in from the sides, a glossy teal pill under the active tab
 * that springs between tabs (ease-spring). Content scrolls underneath, so tabbed screens leave TAB_BAR_SPACE
 * at the bottom. Used on the three top-level screens; flows (plan page, onboarding) use Back instead.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useInvites } from "@/hooks/useInvites";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing } from "@/components/ui/classes";

export const TABS = /** @type {const} */ ([
  { href: "/feed", label: "Feed", icon: "compass" },
  { href: "/plans", label: "Plans", icon: "calendar" },
  { href: "/me", label: "You", icon: "user" },
]);

/** Bottom space a tabbed screen leaves for the bar: 12px gap + ~64px bar + 12px air, plus the home-bar inset. */
export const TAB_BAR_SPACE = "calc(5.5rem + env(safe-area-inset-bottom))";

/** ease-spring from tokens.json: overshooting return (tab pill, toggles). */
const EASE_SPRING = "cubic-bezier(0.2, 1.5, 0.35, 1)";

/**
 * Last active tab, kept across client navigations (module scope), so on a new screen the pill starts
 * under the previous tab and springs to the current one.
 * @type {number | null}
 */
let lastTab = null;

/** @param {{ active: (typeof TABS)[number]["href"] }} props */
export function TabBar({ active }) {
  const index = Math.max(0, TABS.findIndex((t) => t.href === active));
  const [pillAt, setPillAt] = useState(() => lastTab ?? index);
  const { invites } = useInvites();
  const inviteCount = invites.length;

  // Next frame: move the pill to this screen's tab (a CSS transition does the spring).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPillAt(index));
    lastTab = index;
    return () => cancelAnimationFrame(frame);
  }, [index]);

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 z-40 mx-auto w-full max-w-md px-3"
      style={{ bottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <div className="tab-bar pointer-events-auto relative grid grid-cols-3 rounded-[30px] p-1.5">
        <span
          aria-hidden="true"
          className="tab-pill absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/3)] rounded-[24px] transition-transform duration-500 motion-reduce:transition-none"
          style={{ transform: `translateX(${pillAt * 100}%)`, transitionTimingFunction: EASE_SPRING }}
        />
        {TABS.map((tab, i) => {
          const on = i === index;
          const badge = tab.href === "/plans" && inviteCount > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              aria-label={badge ? `${tab.label}, ${inviteCount} new ${inviteCount === 1 ? "invite" : "invites"}` : undefined}
              className={cn(
                "relative z-10 flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[24px] text-[11px] font-bold transition-colors duration-300",
                on ? "text-on-accent" : "text-on-bar/70 hover:text-on-bar",
                focusRing,
              )}
            >
              <span className={cn("relative transition-transform duration-300", on && "scale-110")}>
                <Icon name={tab.icon} cel strokeWidth={1.9} className="size-6" />
                {badge && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-2.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-line bg-peach px-1 text-[10px] leading-none font-bold text-on-accent tabular-nums motion-safe:animate-pop"
                  >
                    {inviteCount}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
