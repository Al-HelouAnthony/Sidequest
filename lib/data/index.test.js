import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";

const MAYA = mockUsers[1].id;

// Every Supabase call fails, like a dead network or a wrong key.
vi.mock("./db", () => {
  const down = async () => {
    throw new Error("fetch failed");
  };
  const names = ["getUser", "getUsers", "listUsers", "getFriends", "getPlaces", "getPlace", "getBusyBlocks",
    "getTravelTimes", "getTagWeights", "setTagWeights", "recordInteraction", "getRecentInteractions"];
  return Object.fromEntries(names.map((n) => [n, down]));
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
