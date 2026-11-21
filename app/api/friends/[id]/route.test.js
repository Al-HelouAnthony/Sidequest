import { beforeEach, describe, expect, it, vi } from "vitest";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));

// Adel's removeFriendship isn't merged yet: stand in for it (idempotent, both directions on his side).
const { remove } = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), removeFriendship: remove }));
const { DataInputError } = await import("@/lib/data");

const { DELETE } = await import("./route");
const del = (id) => DELETE(new Request(`http://localhost/api/friends/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  remove.mockReset();
  remove.mockResolvedValue(undefined);
});

describe("DELETE /api/friends/[id]", () => {
  it("removes the friendship (me from the session, never the URL) → 200 { ok: true }", async () => {
    const res = await del(MAYA);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(SAM, MAYA);
  });

  it("removing twice / someone who isn't a friend is still 200 (never 404)", async () => {
    expect((await del(MAYA)).status).toBe(200);
    expect((await del(MAYA)).status).toBe(200);
  });

  it("removing myself gives 400", async () => {
    expect((await del(SAM)).status).toBe(400);
    expect(remove).not.toHaveBeenCalled();
  });

  it("an invalid id gives 400", async () => {
    expect((await del("not-a-uuid")).status).toBe(400);
  });

  it("a DataInputError from the data layer gives 400", async () => {
    remove.mockRejectedValueOnce(new DataInputError("Invalid user id"));
    expect((await del(MAYA)).status).toBe(400);
  });
});
