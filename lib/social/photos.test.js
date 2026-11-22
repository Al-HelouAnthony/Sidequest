// G4 memory photos (memory mode).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPlaces } from "@/lib/mocks/places";
import { PlanPhotosResponse } from "@/types/api";

vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));
const { cancelPlan, createPlan } = await import("./plans-store");
const { addPhoto, listPhotos, sniffImageType, MAX_PHOTO_BYTES } = await import("./photos");

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const LEA = "00000000-0000-4000-8000-000000000005";
const START = Date.parse("2026-11-21T19:00:00.000Z");
const END = START + 3600_000;
const MIN = 60_000;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
const photo = (bytes, type = "image/jpeg") => new Blob([bytes], { type });

async function plan() {
  return createPlan(SAM, {
    placeId: mockPlaces[0].id,
    start: new Date(START).toISOString(),
    end: new Date(END).toISOString(),
    inviteeIds: [MAYA],
  });
}

beforeEach(() => {
  globalThis.__sqPlans.plans.length = 0;
  globalThis.__sqPlans.members.length = 0;
  globalThis.__sqPhotos.length = 0;
});

describe("sniffImageType (from the bytes, not the name)", () => {
  it("knows JPEG, PNG, WebP and nothing else", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(new Uint8Array([...Buffer.from("GIF89a")]))).toBeNull();
    expect(sniffImageType(new Uint8Array([...Buffer.from("<script>")]))).toBeNull();
  });
});

describe("G4 photos", () => {
  it("a member adds a photo during the plan → the whole album comes back, valid for the contract", async () => {
    const { id } = await plan();
    const photos = await addPhoto(MAYA, id, photo(JPEG), START + 10 * MIN);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ userId: MAYA });
    expect(photos[0].url.startsWith("data:image/jpeg;base64,")).toBe(true);
    PlanPhotosResponse.parse({ photos });
    expect(await listPhotos(SAM, id)).toHaveLength(1); // the other member sees it
  });

  it("album window: opens 15 min before the start, closes 12 h after the end", async () => {
    const { id } = await plan();
    await expect(addPhoto(SAM, id, photo(JPEG), START - 20 * MIN)).rejects.toMatchObject({ status: 409 });
    expect(await addPhoto(SAM, id, photo(PNG), START - 10 * MIN)).toHaveLength(1);
    expect(await addPhoto(SAM, id, photo(WEBP), END + 11 * 60 * MIN)).toHaveLength(2);
    await expect(addPhoto(SAM, id, photo(JPEG), END + 13 * 60 * MIN)).rejects.toMatchObject({ status: 409 });
  });

  it("members only: an outsider can't add or see photos (403)", async () => {
    const { id } = await plan();
    await expect(addPhoto(LEA, id, photo(JPEG), START)).rejects.toMatchObject({ status: 403 });
    await expect(listPhotos(LEA, id)).rejects.toMatchObject({ status: 403 });
  });

  it("not a picture → 415 (even if it says image/jpeg); too big → 413; no file → 400", async () => {
    const { id } = await plan();
    await expect(addPhoto(SAM, id, photo(new Uint8Array([...Buffer.from("hello world")])), START)).rejects.toMatchObject({ status: 415 });
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(JPEG);
    await expect(addPhoto(SAM, id, photo(big), START)).rejects.toMatchObject({ status: 413 });
    await expect(addPhoto(SAM, id, null, START)).rejects.toMatchObject({ status: 400 });
    await expect(addPhoto(SAM, id, "a string", START)).rejects.toMatchObject({ status: 400 });
  });

  it("a cancelled plan takes no photos (409)", async () => {
    const { id } = await plan();
    await cancelPlan(SAM, id);
    await expect(addPhoto(SAM, id, photo(JPEG), START)).rejects.toMatchObject({ status: 409 });
  });
});
