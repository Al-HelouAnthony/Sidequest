import { beforeAll, describe, expect, it, vi } from "vitest";
import { UsersResponse } from "@/types/api";
import { ensureUser, getFriends } from "@/lib/data";
import { mockUsers } from "@/lib/mocks/users";

const SAM = "00000000-0000-4000-8000-000000000001";
const REAL_A = "a1111111-1111-4111-8111-111111111111";
const REAL_B = "b2222222-2222-4222-8222-222222222222";
const DEMO_IDS = new Set(mockUsers.map((u) => u.id));

// Who is "me" for each test.
const { auth } = vi.hoisted(() => ({ auth: { id: "00000000-0000-4000-8000-000000000001" } }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => auth.id }));

const { GET } = await import("./route");
const list = async () => UsersResponse.parse(await (await GET()).json()).users;
const search = async (q) => UsersResponse.parse(await (await GET(new Request(`http://localhost/api/users?q=${encodeURIComponent(q)}`))).json()).users;

beforeAll(async () => {
  // Two real Google accounts exist next to the demo world (mock mode keeps them in memory).
  await ensureUser({ id: REAL_A, name: "Real Alex", avatarUrl: "" });
  await ensureUser({ id: REAL_B, name: "Real Bea", avatarUrl: "" });
});

describe("GET /api/users", () => {
  it("lists everyone except me, friends marked, in the agreed shape", async () => {
    auth.id = SAM;
    const users = await list();
    expect(users.some((u) => u.id === SAM)).toBe(false);
    const friendIds = new Set((await getFriends(SAM)).map((f) => f.user.id));
    for (const u of users) expect(u.isFriend).toBe(friendIds.has(u.id));
  });

  it("a demo user only sees demo people, never real accounts", async () => {
    auth.id = SAM;
    const users = await list();
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) expect(DEMO_IDS.has(u.id)).toBe(true);
  });

  it("a real account only sees other real accounts, never demo people or itself", async () => {
    auth.id = REAL_A;
    const users = await list();
    expect(users.map((u) => u.id)).toContain(REAL_B);
    for (const u of users) {
      expect(DEMO_IDS.has(u.id)).toBe(false);
      expect(u.id).not.toBe(REAL_A);
    }
  });

  it("sends no home location or interests", async () => {
    auth.id = SAM;
    const body = await (await GET()).json();
    for (const u of body.users) {
      expect(Object.keys(u).sort()).toEqual(["avatarUrl", "id", "isFriend", "name", "username"]);
    }
  });

  it("puts people to add before friends", async () => {
    auth.id = SAM;
    const users = await list();
    const firstFriend = users.findIndex((u) => u.isFriend);
    if (firstFriend >= 0) expect(users.slice(firstFriend).every((u) => u.isFriend)).toBe(true);
  });

  it("every person has a unique @username (computed from the first name)", async () => {
    auth.id = SAM;
    const users = await list();
    expect(users.every((u) => /^[a-z0-9_]{3,20}$/.test(u.username ?? ""))).toBe(true);
    expect(new Set(users.map((u) => u.username)).size).toBe(users.length);
    expect(users.find((u) => u.name.startsWith("Maya"))?.username).toBe("maya");
  });

  it("?q= searches by @username or name, in my world only", async () => {
    auth.id = SAM;
    expect((await search("@ma")).map((u) => u.username)).toEqual(["maya"]);
    expect((await search("MAYA")).length).toBe(1);
    expect(await search("zzz")).toEqual([]);
    expect(await search("real")).toEqual([]); // real accounts are invisible to demo users
    auth.id = REAL_A;
    expect((await search("bea")).map((u) => u.id)).toEqual([REAL_B]);
  });
});
