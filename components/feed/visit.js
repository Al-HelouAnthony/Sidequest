/**
 * Per-visit feed variety (PLAN.md §12 N2, client side). Owner: Oscar.
 * - seed: a random number per visit (page load), sent with every page of that visit so pages stay consistent
 *   (same seed → same order). The engine adds a small seeded jitter to scores (Anthony).
 * - seen: place ids the user actually looked at, kept in localStorage (last SEEN_MAX, newest last). Each visit sends
 *   the list as it was when the visit STARTED, so "places shown in your last sessions" drop a little.
 * Storage can be blocked (private mode, SSR): everything degrades to "no seen list".
 */

const SEEN_KEY = "sidequest:seen-places";
const SEEN_MAX = 30;

/** Random positive 31-bit integer (fits the engine's seeded PRNG and a URL). */
export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

/** @returns {string[]} */
export function readSeen() {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(-SEEN_MAX) : [];
  } catch {
    return [];
  }
}

/** Remember that a place was shown (moves it to the newest end; keeps the last SEEN_MAX). */
export function rememberSeen(/** @type {string} */ placeId) {
  try {
    const list = readSeen().filter((id) => id !== placeId);
    list.push(placeId);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_MAX)));
  } catch {
    // Storage blocked: variety still works through the seed.
  }
}

/**
 * Query params for GET /api/feed: seed always, seen when non-empty (comma-separated place ids).
 * @param {URLSearchParams} params @param {{ seed: number, seen: string[] }} visit
 */
export function addVisitParams(params, visit) {
  params.set("seed", String(visit.seed));
  if (visit.seen.length) params.set("seen", visit.seen.join(","));
}
