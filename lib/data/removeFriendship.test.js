// removeFriendship (mock mode): both directions, idempotent, re-adding works, bad ids rejected.
// QA found the Friends tab's "Remove" always answered 405 because this function was never merged.
import { describe, expect, it } from "vitest";
import { addFriendship, DataInputError, getFriends, removeFriendship } from "./index";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const friendIds = async (id) => (await getFriends(id)).map((f) => f.user.id);

describe("removeFriendship", () => {
  it("removes both directions, is idempotent, and a later add brings the friend back", async () => {
    expect(await friendIds(SAM)).toContain(MAYA);
    await removeFriendship(SAM, MAYA);
    expect(await friendIds(SAM)).not.toContain(MAYA);
    expect(await friendIds(MAYA)).not.toContain(SAM);
    await removeFriendship(SAM, MAYA); // again: no error
    await addFriendship(SAM, MAYA, 3);
    expect(await friendIds(SAM)).toContain(MAYA);
    expect(await friendIds(MAYA)).toContain(SAM);
  });

  it("rejects bad ids and yourself", async () => {
    await expect(removeFriendship(SAM, "bob")).rejects.toBeInstanceOf(DataInputError);
    await expect(removeFriendship(SAM, SAM)).rejects.toBeInstanceOf(DataInputError);
  });
});
