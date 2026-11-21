import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockFeedCards } from "@/lib/mocks/feedCards";
import { templateCaption } from "./templates";
import { captionCards, clearCaptionCache } from "./captions";

// Fake Claude: no API key, no network, no cost.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("./client", () => ({
  CAPTION_MODEL: "test-model",
  getClaudeClient: () => ({ messages: { parse } }),
}));

const cards = buildMockFeedCards().slice(0, 3);
const reply = (captions) => ({ parsed_output: { captions } });

beforeEach(() => {
  parse.mockReset();
  clearCaptionCache();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("captionCards", () => {
  it("uses Claude's captions when they are valid", async () => {
    parse.mockResolvedValue(reply(cards.map((c) => ({ cardId: c.id, caption: `Go to ${c.place.name}` }))));
    const result = await captionCards(cards);
    for (const c of cards) expect(result.get(c.id)).toBe(`Go to ${c.place.name}`);
  });

  it("makes ONE call for all cards", async () => {
    parse.mockResolvedValue(reply([]));
    await captionCards(cards);
    expect(parse).toHaveBeenCalledTimes(1);
    const sent = parse.mock.calls[0][0].messages[0].content;
    for (const c of cards) expect(sent).toContain(c.id);
  });

  it("missing, empty or too long captions fall back to the template", async () => {
    parse.mockResolvedValue(
      reply([
        { cardId: cards[0].id, caption: "x".repeat(91) },
        { cardId: cards[1].id, caption: "   " },
      ]),
    );
    const result = await captionCards(cards);
    for (const c of cards) expect(result.get(c.id)).toBe(templateCaption(c));
  });

  it("ignores captions for cards it did not ask about", async () => {
    parse.mockResolvedValue(reply([{ cardId: "not-a-card", caption: "Hello" }]));
    const result = await captionCards(cards);
    expect(result.size).toBe(cards.length);
    expect([...result.values()]).not.toContain("Hello");
  });

  it("a Claude error (no key, timeout) gives every card the template", async () => {
    parse.mockRejectedValue(new Error("timeout"));
    const result = await captionCards(cards);
    for (const c of cards) expect(result.get(c.id)).toBe(templateCaption(c));
  });

  it("no parsed answer (refusal or bad JSON) gives the template", async () => {
    parse.mockResolvedValue({ parsed_output: null });
    const result = await captionCards(cards);
    for (const c of cards) expect(result.get(c.id)).toBe(templateCaption(c));
  });

  it("the same cards twice only ask Claude once", async () => {
    parse.mockResolvedValue(reply(cards.map((c) => ({ cardId: c.id, caption: "Nice spot" }))));
    await captionCards(cards);
    await captionCards(cards);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("the same card with different friends free asks again", async () => {
    parse.mockResolvedValue(reply([{ cardId: cards[0].id, caption: "Nice spot" }]));
    await captionCards([cards[0]]);
    await captionCards([{ ...cards[0], friends: [] }]);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("every mock card gets a caption even when Claude is down", async () => {
    parse.mockRejectedValue(new Error("ANTHROPIC_API_KEY is not set"));
    const all = buildMockFeedCards();
    const result = await captionCards(all);
    for (const c of all) expect(result.get(c.id)?.length).toBeGreaterThan(0);
  });
});
