import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/types/domain";
import { DEMO_USER_ID, mockFriendships } from "@/lib/mocks/users";
import { mockPlaces } from "@/lib/mocks/places";

// Wrap the real (mock-backed) data layer in spies so we can see exactly what the loader asks for.
vi.mock("@/lib/data", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getBusyBlocks: vi.fn(actual.getBusyBlocks),
    getTravelTimes: vi.fn(actual.getTravelTimes),
    getWeather: vi.fn(actual.getWeather),
    getPlaces: vi.fn(actual.getPlaces),
  };
});

const data = await import("@/lib/data");
const { cachedPlaces, horizonRange, loadContext, resetPlacesCache } = await import("./load");

// The mock builders are relative to the real clock, so the loader test uses "now" too.
// (Inside lib/engine the clock is never read; only tests and the route create `now`.)
const now = DateTime.now().setZone(TIMEZONE);
const friendIds = mockFriendships.filter((f) => f.userId === DEMO_USER_ID).map((f) => f.friendId);

describe("loadContext (Part 1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a full EngineContext for the demo user", async () => {
    const ctx = await loadContext(DEMO_USER_ID, now);
    expect(ctx).not.toBeNull();
    if (!ctx) return;
    expect(ctx.me.id).toBe(DEMO_USER_ID);
    expect(ctx.friends.map((f) => f.user.id).sort()).toEqual([...friendIds].sort());
    // Curated places, plus any city events near me (mock mode has a few once Adel's events are merged).
    expect(ctx.places.filter((p) => p.source !== "event")).toHaveLength(mockPlaces.length);
    expect(ctx.places.filter((p) => p.source === "event").every((p) => p.category === "event")).toBe(true);
    expect(ctx.busyByUser.size).toBe(1 + friendIds.length);
    expect(ctx.travel.size).toBe((1 + friendIds.length) * ctx.places.length); // events get estimates too
    expect(ctx.weatherByHour.size).toBeGreaterThan(0);
    expect(ctx.now).toBe(now);
  });

  it("only ever asks for me + my friends (never ids from outside)", async () => {
    await loadContext(DEMO_USER_ID, now);
    const expected = [DEMO_USER_ID, ...friendIds].sort();
    expect([...vi.mocked(data.getBusyBlocks).mock.calls[0][0]].sort()).toEqual(expected);
    expect([...vi.mocked(data.getTravelTimes).mock.calls[0][0]].sort()).toEqual(expected);
    expect(vi.mocked(data.getTravelTimes).mock.calls[0][1]).toHaveLength(mockPlaces.length);
  });

  it("uses one horizon range: now → after the 7-day horizon", async () => {
    await loadContext(DEMO_USER_ID, now);
    const range = vi.mocked(data.getBusyBlocks).mock.calls[0][1];
    expect(range).toEqual(horizonRange(now));
    expect(vi.mocked(data.getWeather).mock.calls[0][0]).toEqual(range);
    expect(Date.parse(range.start)).toBe(now.toMillis());
    expect(Date.parse(range.end) - now.toMillis()).toBeGreaterThan(7 * 86_400_000);
  });

  it("returns null for an unknown user and fetches nothing per-person", async () => {
    expect(await loadContext("00000000-0000-4000-8000-0000000000ff", now)).toBeNull();
    expect(data.getBusyBlocks).not.toHaveBeenCalled();
  });
});

describe("cachedPlaces (G6c)", () => {
  beforeEach(() => {
    resetPlacesCache();
    vi.clearAllMocks();
  });

  it("reads the places once per 5 minutes, then again", async () => {
    const t = 1_000_000;
    await cachedPlaces(t);
    await cachedPlaces(t + 60_000);
    expect(data.getPlaces).toHaveBeenCalledTimes(1);
    await cachedPlaces(t + 5 * 60_000 + 1);
    expect(data.getPlaces).toHaveBeenCalledTimes(2);
  });

  it("never caches a failed read", async () => {
    vi.mocked(data.getPlaces).mockRejectedValueOnce(new Error("db down"));
    await expect(cachedPlaces(1)).rejects.toThrow("db down");
    await Promise.resolve();
    expect((await cachedPlaces(2)).length).toBeGreaterThan(0);
    expect(data.getPlaces).toHaveBeenCalledTimes(2);
  });

  it("two feed loads in a row: the second skips the places query", async () => {
    await loadContext(DEMO_USER_ID, now);
    await loadContext(DEMO_USER_ID, now);
    expect(data.getPlaces).toHaveBeenCalledTimes(1);
  });
});
