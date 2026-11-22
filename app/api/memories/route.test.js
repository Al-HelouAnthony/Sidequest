// GET /api/memories end to end (memory mode): photos from all my plans, grouped by plan, newest first.
import { describe, expect, it, vi } from "vitest";
import { MemoriesResponse } from "@/types/api";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const KARIM = "00000000-0000-4000-8000-000000000003";
const LEA = "00000000-0000-4000-8000-000000000005";
const { auth } = vi.hoisted(() => ({ auth: { id: "00000000-0000-4000-8000-000000000001" } }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => auth.id }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));

const { createPlan } = await import("@/lib/social/plans-store");
const { addPhoto } = await import("@/lib/social/photos");
const { GET } = await import("./route");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const photo = () => new Blob([JPEG], { type: "image/jpeg" });

/** A plan by Sam that started `agoMin` minutes ago (album open). */
async function planStarted(agoMin, placeIndex, invitees) {
  const start = Date.now() - agoMin * 60_000;
  const plan = await createPlan(SAM, {
    placeId: mockPlaces[placeIndex].id,
    start: new Date(start).toISOString(),
    end: new Date(start + 3600_000).toISOString(),
    inviteeIds: invitees,
  });
  return plan.id;
}

async function memoriesAs(userId) {
  auth.id = userId;
  const res = await GET();
  expect(res.status).toBe(200);
  return MemoriesResponse.parse(await res.json()).memories;
}

describe("GET /api/memories", () => {
  it("groups my plans' photos, newest plan first, skips plans without photos, never shows others' plans", async () => {
    const older = await planStarted(120, 0, [MAYA]);
    const newer = await planStarted(5, 1, [MAYA]);
    await planStarted(10, 2, [MAYA]); // no photos → not a memory
    const notMine = await planStarted(15, 3, [KARIM]);

    await addPhoto(SAM, older, photo());
    await addPhoto(MAYA, older, photo());
    await addPhoto(MAYA, newer, photo());
    await addPhoto(KARIM, notMine, photo());

    const sam = await memoriesAs(SAM);
    // Sam made all four; newest start first (5, 15, 120 min ago), the photo-less one is left out.
    expect(sam.map((m) => m.planId)).toEqual([newer, notMine, older]);
    const mine = sam.find((m) => m.planId === older);
    expect(mine?.photos).toHaveLength(2);
    expect(mine?.place.name).toBe(mockPlaces[0].name);
    // Maya hasn't said "in" yet but added a photo → she's in `people`.
    expect(mine?.people.map((p) => p.userId).sort()).toEqual([SAM, MAYA].sort());

    const maya = await memoriesAs(MAYA);
    expect(maya.map((m) => m.planId)).toEqual([newer, older]); // not Karim's plan
    expect(await memoriesAs(LEA)).toEqual([]);
  });
});
