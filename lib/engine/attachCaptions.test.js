/** Part 11c: captions are attached within the budget, templates otherwise, never a crash. */
import { describe, expect, it, vi } from "vitest";
import { makeCtx } from "./fixtures";
import { buildFeed } from "./index";
import { attachCaptions } from "./attachCaptions";

const page = buildFeed(makeCtx()).cards.slice(0, 5);
const claudeLike = (cards) => new Map(cards.map((c) => [c.id, `AI: ${c.place.name}`]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("attachCaptions", () => {
  it("fast captioner → every card gets the new caption, nothing else changes", async () => {
    const { cards, info } = await attachCaptions(page, async (c) => claudeLike(c), 500);
    expect(cards.map((c) => c.caption)).toEqual(page.map((c) => `AI: ${c.place.name}`));
    expect(cards.map(({ caption, ...rest }) => rest)).toEqual(page.map(({ caption, ...rest }) => rest));
    expect(info).toMatchObject({ fromClaude: 5, timedOut: false });
  });

  it("slow captioner → returns on budget with the template captions", async () => {
    const t0 = Date.now();
    const { cards, info } = await attachCaptions(page, async (c) => (await sleep(400), claudeLike(c)), 100);
    expect(Date.now() - t0).toBeLessThan(350);
    expect(cards).toEqual(page);
    expect(info).toMatchObject({ fromClaude: 0, timedOut: true });
  });

  it("captioner that throws → templates, no crash", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cards, info } = await attachCaptions(page, async () => { throw new Error("boom"); }, 100);
    expect(cards).toEqual(page);
    expect(info.fromClaude).toBe(0);
    warn.mockRestore();
  });

  it("missing, empty or template-identical captions keep the template", async () => {
    const partial = async (c) => new Map([[c[0].id, "  "], [c[1].id, c[1].caption], [c[2].id, "AI: real one"]]);
    const { cards, info } = await attachCaptions(page, partial, 500);
    expect(cards[0].caption).toBe(page[0].caption);
    expect(cards[1].caption).toBe(page[1].caption);
    expect(cards[2].caption).toBe("AI: real one");
    expect(info.fromClaude).toBe(1);
  });

  it("empty page → captioner is never called", async () => {
    const spy = vi.fn();
    expect((await attachCaptions([], spy, 100)).cards).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
