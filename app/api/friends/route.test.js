import { describe, expect, it, vi } from "vitest";
import { OkResponse } from "@/types/api";
import { getFriends } from "@/lib/data";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const STRANGER = "99999999-0000-4000-8000-000000000999";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));

const { POST } = await import("./route");
const post = (body) =>
  POST(new Request("http://localhost/api/friends", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/friends", () => {
  it("adds a friend and returns { ok: true }", async () => {
    const res = await post({ friendId: MAYA });
    expect(res.status).toBe(200);
    OkResponse.parse(await res.json());
    expect((await getFriends(SAM)).some((f) => f.user.id === MAYA)).toBe(true);
  });

  it("adding the same friend twice is still OK", async () => {
    expect((await post({ friendId: MAYA })).status).toBe(200);
    expect((await post({ friendId: MAYA })).status).toBe(200);
  });

  it("adding myself gives 400", async () => {
    expect((await post({ friendId: SAM })).status).toBe(400);
  });

  it("unknown user gives 404", async () => {
    expect((await post({ friendId: STRANGER })).status).toBe(404);
  });

  it("bad body gives 400", async () => {
    expect((await post({ friendId: "nope" })).status).toBe(400);
  });
});
