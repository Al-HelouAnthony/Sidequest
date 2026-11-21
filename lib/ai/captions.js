/**
 * Claude captions: one friendly line per feed card, written by Claude.
 * Owner: Mhammad. Called by Anthony's feed route on the current page of cards (his Part 11c).
 * ONE Claude call for all cards. Any problem → templateCaption() for that card. Never throws.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CAPTION_MODEL, getClaudeClient } from "./client";
import { MAX_CAPTION_CHARS, templateCaption } from "./templates";
import { formatSlot } from "@/lib/time";

/** What Claude must send back. */
const CaptionReply = z.object({
  captions: z.array(z.object({ cardId: z.string(), caption: z.string() })),
});

const SYSTEM_PROMPT = `You write the one-line caption on suggestion cards in a Montréal app that helps friends make plans.
For each card, write one short, friendly line that makes people want to go.
Rules:
- At most 80 characters. Shorter is better.
- Use only the facts given for that card. Never invent prices, menus, events, opening hours or anything else.
- No describing words that are not in the facts (no "cozy", "trendy", "hidden gem").
- Never say "cheap". For a low price level, say "budget".
- No emojis, no hashtags, no quotes.
- Return exactly one caption for every cardId.`;

/** Captions already written. Key = card id + who is free, so friends never see each other's captions. */
const cache = new Map();
const MAX_CACHE = 1000;

/** @param {import("@/types/feed").FeedCardT} card */
const cacheKey = (card) => `${card.id}|${card.friends.map((f) => f.id).join(",")}`;

/** Clears the cache (for tests). */
export function clearCaptionCache() {
  cache.clear();
}

/**
 * The facts Claude may use for one card, and nothing else.
 * @param {import("@/types/feed").FeedCardT} card
 */
function cardFacts(card) {
  return {
    cardId: card.id,
    place: card.place.name,
    category: card.place.category,
    when: formatSlot(card.slot.start, card.slot.end),
    friendsFree: card.friends.map((f) => f.name),
    longestTripMin: Math.max(card.myTravelMin, ...card.friends.map((f) => f.travelMin)),
    weather: `${Math.round(card.weather.tempC)}°C, ${card.weather.icon}`,
    priceLevel: card.place.priceLevel,
  };
}

/**
 * One Claude call for all the given cards.
 * @param {import("@/types/feed").FeedCardT[]} cards
 * @returns {Promise<{ cardId: string, caption: string }[]>}
 */
async function askClaude(cards) {
  const response = await getClaudeClient().messages.parse({
    model: CAPTION_MODEL,
    max_tokens: 2000,
    thinking: { type: "disabled" }, // short lines: thinking would only add waiting time
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(cards.map(cardFacts)) }],
    output_config: { format: zodOutputFormat(CaptionReply) },
  });
  return response.parsed_output?.captions ?? [];
}

/**
 * @param {import("@/types/feed").FeedCardT[]} cards
 * @returns {Promise<Map<string, string>>} card id → caption, for EVERY card given. Never throws.
 */
export async function captionCards(cards) {
  const missing = cards.filter((c) => !cache.has(cacheKey(c)));
  if (missing.length > 0) {
    try {
      const byId = new Map(missing.map((c) => [c.id, c]));
      for (const { cardId, caption } of await askClaude(missing)) {
        const card = byId.get(cardId);
        const text = caption.trim();
        if (card && text.length > 0 && text.length <= MAX_CAPTION_CHARS) {
          if (cache.size >= MAX_CACHE) cache.clear();
          cache.set(cacheKey(card), text);
        }
      }
    } catch (error) {
      console.warn("[captions] using template captions:", error instanceof Error ? error.message : error);
    }
  }
  return new Map(cards.map((c) => [c.id, cache.get(cacheKey(c)) ?? templateCaption(c)]));
}
