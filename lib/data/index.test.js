import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";

const MAYA = mockUsers[1].id;

// Every Supabase call fails, like a dead network or a wrong key.
vi.mock("./db", () => {
  const down = async () => {
    throw new Error("fetch failed");
  };
  const names = ["getUser", "getUsers", "listUsers", "getFriends", "getPlaces", "getPlace", "getBusyBlocks",
    "getTravelTimes", "getTagWeights", "setTagWeights", "recordInteraction", "getRecentInteractions",
    "ensureUser", "replaceBusyBlocks"];
  return { ...Object.fromEntries(names.map((n) => [n, down])), DEFAULT_HOME: { lat: 45.5048, lng: -73.5772 } };
});

/** Fresh import of lib/data with the given env (USE_MOCK_DATA etc. are read at import time). */
async function load(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./index");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("mock friendships go both ways", () => {
  it("every demo user has friends; Maya (phone 2) has Sam, Karim and Léa", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    expect((await data.getFriends(MAYA)).map((f) => f.user.name).sort()).toEqual(["Karim", "Léa", "Sam"]);
    expect(await data.getFriends(DEMO_USER_ID)).toHaveLength(4);
    for (const u of mockUsers) expect((await data.getFriends(u.id)).length).toBeGreaterThan(0);
  });

  it("every row has its reverse with the same closeness", async () => {
    const { mockFriendships } = await import("@/lib/mocks/users");
    for (const f of mockFriendships) {
      expect(mockFriendships).toContainEqual({ userId: f.friendId, friendId: f.userId, closeness: f.closeness });
    }
  });
});

const NEW_ID = "aaaaaaaa-0000-4000-8000-00000000abcd";
const block = (over = {}) => ({ userId: NEW_ID, startAt: "2026-11-22T15:00:00.000Z", endAt: "2026-11-22T16:00:00.000Z", source: "google", ...over });

describe("ensureUser (mock mode)", () => {
  it("creates a new user with the McGill default home, and it's then visible to getUser", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    const u = await data.ensureUser({ id: NEW_ID, name: "  Oscar M ", avatarUrl: "https://pic" });
    expect(u).toEqual({ id: NEW_ID, name: "Oscar M", avatarUrl: "https://pic", homeLat: 45.5048, homeLng: -73.5772, interests: [] });
    expect(await data.getUser(NEW_ID)).toEqual(u);
  });

  it("never overwrites an existing user, and fills safe defaults", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const sam = await data.ensureUser({ id: DEMO_USER_ID, name: "Someone Else", avatarUrl: "" });
    expect(sam.name).toBe("Sam");
    const blank = await data.ensureUser({ id: "aaaaaaaa-0000-4000-8000-00000000beef", name: "", avatarUrl: null });
    expect(blank).toMatchObject({ name: "New user", avatarUrl: "" });
  });

  it("rejects a non-uuid id", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.ensureUser({ id: "nope", name: "x", avatarUrl: "" })).rejects.toThrow();
  });
});

describe("replaceBusyBlocks (mock mode)", () => {
  it("replaces that user's google blocks and they show up in getBusyBlocks", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const range = { start: "2026-11-22T00:00:00.000Z", end: "2026-11-23T00:00:00.000Z" };
    expect(await data.replaceBusyBlocks(NEW_ID, [block(), block({ startAt: "2026-11-22T18:00:00.000Z", endAt: "2026-11-22T19:00:00.000Z" })], "google")).toEqual({ imported: 2 });
    expect(await data.getBusyBlocks([NEW_ID], range)).toHaveLength(2);
    expect(await data.replaceBusyBlocks(NEW_ID, [], "google")).toEqual({ imported: 0 }); // calendar now empty
    expect(await data.getBusyBlocks([NEW_ID], range)).toHaveLength(0);
  });

  it("refuses blocks for another user, another source, 'seed', or ending before they start", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ userId: DEMO_USER_ID })])).rejects.toThrow(/passed for user/);
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ source: "manual" })], "google")).rejects.toThrow(/source/);
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ source: "seed" })], "seed")).rejects.toThrow();
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ endAt: "2026-11-22T14:00:00.000Z" })])).rejects.toThrow(/ends before/);
  });
});

describe("Supabase failure", () => {
  it("falls back to mock data and logs it (default)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await load({ USE_MOCK_DATA: "false" });
    expect((await data.getUser(DEMO_USER_ID))?.name).toBe("Sam");
    expect(await data.getFriends(MAYA)).toHaveLength(3);
    expect((await data.getPlaces()).length).toBeGreaterThan(0);
    const saved = await data.recordInteraction(DEMO_USER_ID, { placeId: mockUsers[0].id, slotStart: "2026-11-22T19:00:00.000Z", action: "skip" });
    expect(saved.action).toBe("skip");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("falling back to mock data: fetch failed"));
  });

  it("throws when DATA_FALLBACK=false", async () => {
    const data = await load({ USE_MOCK_DATA: "false", DATA_FALLBACK: "false" });
    await expect(data.getUser(DEMO_USER_ID)).rejects.toThrow("fetch failed");
  });
});
