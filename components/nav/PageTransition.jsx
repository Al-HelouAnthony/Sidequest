/**
 * Smooth page changes: the content slides in the direction you're going (React <ViewTransition>, the
 * browser's View Transitions API). Links say the direction with transitionTypes: "nav-forward" (a tab to
 * the right, opening a plan) or "nav-back" (a tab to the left, Back). Anything else (browser back,
 * refresh) changes instantly, as before. The tab bar and the dotted background stay put (globals.css).
 * Browsers without view transitions just switch pages normally. Reduced motion: no slide.
 */
import { ViewTransition } from "react";

const DIRECTIONS = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/** Wrap a page's content (in page.jsx, not a layout: layouts don't enter/exit). @param {{ children: React.ReactNode }} props */
export function PageTransition({ children }) {
  return (
    <ViewTransition enter={DIRECTIONS} exit={DIRECTIONS} default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Direction for a tab link: towards a tab on the right slides left (forward), towards the left slides right.
 * @param {number} from current tab index @param {number} to target tab index
 */
export const tabDirection = (from, to) => [to > from ? "nav-forward" : "nav-back"];
