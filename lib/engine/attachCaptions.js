/**
 * Part 11c: put Claude captions (Mhammad's captionCards) on a page of cards, with a time budget.
 * Owner: Anthony.
 *
 * - Cards already carry a template caption from the engine, so there is always something to show.
 * - We wait at most `budgetMs` for Claude. If it's slower, the page goes out with template captions;
 *   captionCards keeps running in the background and caches its answers, so the NEXT load has them.
 * - captionCards never throws (it falls back to templates itself), but we guard anyway.
 */
import { ENGINE } from "./config";

/** @typedef {import("@/types/feed").FeedCardT} FeedCardT */

/**
 * @param {FeedCardT[]} page
 * @param {(cards: FeedCardT[]) => Promise<Map<string, string>>} captioner  e.g. captionCards from lib/ai/captions
 * @param {number} [budgetMs]
 * @param {(pending: Promise<unknown>) => void} [keepAlive]  Called ONLY when Claude is slower than the budget,
 *   with the still-running caption job. Route handlers pass `(p) => after(() => p)` (next/server), so on Vercel
 *   the job finishes after the response and fills the cache for the next load instead of being frozen.
 * @returns {Promise<{ cards: FeedCardT[], info: { fromClaude: number, timedOut: boolean, ms: number } }>}
 */
export async function attachCaptions(page, captioner, budgetMs = ENGINE.captionBudgetMs, keepAlive) {
  const t0 = performance.now();
  if (page.length === 0) return { cards: page, info: { fromClaude: 0, timedOut: false, ms: 0 } };

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  /** @type {Map<string, string> | null} */
  let captions = null;
  let job;
  try {
    job = Promise.resolve().then(() => captioner(page));
    captions = await Promise.race([job, timeout]);
  } catch (error) {
    console.warn("[feed] captions failed, keeping templates:", error instanceof Error ? error.message : error);
  } finally {
    clearTimeout(timer);
  }
  // Too slow: let the job finish in the background (it caches its captions for the next load).
  if (captions === null && job && keepAlive) keepAlive(job.catch(() => {}));

  let fromClaude = 0;
  const cards = page.map((card) => {
    const text = captions?.get(card.id)?.trim();
    if (!text || text === card.caption) return card;
    fromClaude++;
    return { ...card, caption: text };
  });
  return { cards, info: { fromClaude, timedOut: captions === null, ms: Math.round(performance.now() - t0) } };
}
