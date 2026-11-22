# Playwright flows used by the overnight QA run

Run with the Playwright MCP tool (`browser_run_code_unsafe`) against `next start -p 3100` pointed at the LOCAL Supabase.
The templates take session cookies from `scripts/qa-session.mjs` (local auth only); replace `__DATA__` / `__JAR__` before running.

- `realtime-3-users.template.js`: A invites B and C while they sit on the feed → banner timing; B says I'm in → A and C see "confirmed"; C offline/online catches up.
- `visual-sweep.template.js`: 33 screens/states × 3 viewports → screenshots + overflow, broken images, tap targets, axe (serious/critical), console errors, failed requests.
- `feed-perf.playwright.js`: LCP / CLS / long tasks on /feed, then snapping through 20 cards (frame gaps), fast vs throttled phone.
