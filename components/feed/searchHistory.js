/**
 * Recent searches for the search sheet. Owner: Oscar.
 * The last MAX queries the user ran successfully, newest first, in localStorage ("sq-search-history").
 * A repeated query (same words, ignoring case and extra spaces) moves to the top instead of duplicating.
 * Every storage access is wrapped in try/catch: with storage blocked (private mode, settings) the history is
 * simply empty and saving does nothing. Browser-only: call from effects and handlers, never during render.
 */

const KEY = "sq-search-history";
const MAX = 8;

/** @param {string} q */
const tidy = (q) => q.trim().replace(/\s+/g, " ");

/** @returns {string[]} newest first */
export function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((q) => typeof q === "string" && q.trim()).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** @param {string[]} list @returns {string[]} */
function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked or full: keep working without history.
  }
  return list;
}

/**
 * Put a query at the top (after a successful search).
 * @param {string} query
 * @returns {string[]} the new list
 */
export function addToHistory(query) {
  const q = tidy(query);
  if (!q) return readHistory();
  const key = q.toLowerCase();
  return write([q, ...readHistory().filter((h) => h.toLowerCase() !== key)].slice(0, MAX));
}

/**
 * @param {string} query exactly as listed
 * @returns {string[]} the new list
 */
export function removeFromHistory(query) {
  return write(readHistory().filter((h) => h !== query));
}

/** @returns {string[]} the new (empty) list */
export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
  return [];
}
