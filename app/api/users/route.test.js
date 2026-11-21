import { describe, expect, it, vi } from "vitest";
import { UsersResponse } from "@/types/api";
import { getFriends } from "@/lib/data";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));

const { GET } = await import("./route");

describe("GET /api/users", () => {
  it("lists everyone except me, friends marked, in the agreed shape", async () => {
    const body = await (await GET()).json();
    const { users } = UsersResponse.parse(body);

    expect(users.some((u) => u.id === SAM)).toBe(false);
    const friendIds = new Set((await getFriends(SAM)).map((f) => f.user.id));
    for (const u of users) expect(u.isFriend).toBe(friendIds.has(u.id));
  });

  it("sends no home location or interests", async () => {
    const body = await (await GET()).json();
    for (const u of body.users) {
      expect(Object.keys(u).sort()).toEqual(["avatarUrl", "id", "isFriend", "name"]);
    }
  });

  it("puts people to add before friends", async () => {
    const { users } = await (await GET()).json();
    const firstFriend = users.findIndex((u) => u.isFriend);
    if (firstFriend >= 0) expect(users.slice(firstFriend).every((u) => u.isFriend)).toBe(true);
  });
});
