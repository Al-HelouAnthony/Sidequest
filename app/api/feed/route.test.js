/** GET /api/feed: N2 seed/seen + N3 endless cursor, through the real route handler. No network, no Claude. */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FeedResponse } from "@/types/api";
import { makeCtx } from "@/lib/engine/fixtures";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));
vi.mock("@/lib/ai/captions", () => ({ captionCards: async () => new Map() }));
vi.mock("@/lib/engine/load", () => ({ loadContext: async () => makeCtx() }));

const { GET } = await import("./route");
async function feed(query = "") {
  const res = await GET(new NextRequest(`http://localhost/api/feed${query}`));
  return { status: res.status, body: res.status === 200 ? FeedResponse.parse(await res.json()) : await res.json() };
}

/** Follows nextCursor for up to `pages` pages. */
async function scroll(query, pages) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < pages; i++) {
    const { body } = await feed(`?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    all.push(...body.cards);
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  return { cards: all, lastCursor: cursor };
}

describe("GET /api/feed (N2 + N3)", () => {
  it("same seed → same first page; different seed → (usually) a different one", async () => {
    const a = (await feed("?seed=7")).body.cards.map((c) => c.id);
    const b = (await feed("?seed=7")).body.cards.map((c) => c.id);
    expect(a).toEqual(b);
    const others = await Promise.all([1, 2, 3].map(async (s) => (await feed(`?seed=${s}`)).body.cards.map((c) => c.id).join()));
    expect(others.some((o) => o !== a.join())).toBe(true);
  });

  it("never ends: 8 pages of scrolling, every card id unique, cursors move through passes", async () => {
    // A pass's last page can be short (18 places = 10 + 8), never empty.
    const { cards, lastCursor } = await scroll("seed=42", 8);
    expect(cards.length).toBeGreaterThanOrEqual(60);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(lastCursor).toMatch(/^[3-9]:\d+$/);
  });

  it("filtered feeds (search) end after pass 2", async () => {
    const filters = encodeURIComponent(JSON.stringify({ categories: ["cafe"] }));
    const { cards, lastCursor } = await scroll(`seed=1&filters=${filters}`, 20);
    expect(lastCursor).toBeNull();
    expect(cards.every((c) => c.place.category === "cafe")).toBe(true);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  });

  it("bad seed → 400; junk ids in seen are ignored; legacy numeric cursor still works", async () => {
    expect((await feed("?seed=-3")).status).toBe(400);
    expect((await feed("?seed=abc")).status).toBe(400);
    expect((await feed("?seen=not-a-uuid,%27;drop")).status).toBe(200);
    const { body } = await feed("?cursor=10");
    expect(body.cards.length).toBeGreaterThan(0);
  });
});
