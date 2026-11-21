/**
 * Claude client for captions. Server only: never import this from a component.
 * Owner: Mhammad. Used by lib/ai/captions.js.
 */
import Anthropic from "@anthropic-ai/sdk";

/** Model for the one-line card captions. */
export const CAPTION_MODEL = "claude-haiku-5-5";
/** Give up after 4 s so the feed never waits on Claude. */
export const CLAUDE_TIMEOUT_MS = 4000;

/** @type {Anthropic | null} */
let client = null;

/**
 * The shared Claude client.
 * @returns {Anthropic}
 * @throws {Error} when ANTHROPIC_API_KEY is missing. Callers catch it and use templateCaption().
 */
export function getClaudeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set: using template captions");
  // maxRetries 0: a retry would blow the 4 s budget (the SDK default is 2 retries).
  client ??= new Anthropic({ apiKey, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 0 });
  return client;
}
