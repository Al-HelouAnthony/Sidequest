// G4 routes end to end (memory mode): multipart upload → album, as Oscar's PlanPhotos.jsx does it.
import { describe, expect, it, vi } from "vitest";
import { PlanPhotosResponse } from "@/types/api";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const LEA = "00000000-0000-4000-8000-000000000005";
const { auth } = vi.hoisted(() => ({ auth: { id: "00000000-0000-4000-8000-000000000001" } }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => auth.id }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), getBusyBlocks: async () => [] }));

const { createPlan } = await import("@/lib/social/plans-store");
const { GET, POST } = await import("./route");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** A plan that started 5 minutes ago (album open). */
async function livePlan() {
  const start = Date.now() - 5 * 60_000;
  const plan = await createPlan(SAM, {
    placeId: mockPlaces[0].id,
    start: new Date(start).toISOString(),
    end: new Date(start + 3600_000).toISOString(),
    inviteeIds: [MAYA],
  });
  return plan.id;
}
const ctx = (id) => ({ params: Promise.resolve({ id }) });
function upload(id, bytes, field = "photo") {
  const body = new FormData();
  body.append(field, new Blob([bytes], { type: "image/jpeg" }), "memory.jpg");
  return POST(new Request(`http://localhost/api/plans/${id}/photos`, { method: "POST", body }), ctx(id));
}

describe("POST/GET /api/plans/[id]/photos", () => {
  it("member uploads (multipart 'photo') → 201 album; the other member GETs it", async () => {
    auth.id = SAM;
    const id = await livePlan();
    const res = await upload(id, JPEG);
    expect(res.status).toBe(201);
    expect(PlanPhotosResponse.parse(await res.json()).photos).toHaveLength(1);
    auth.id = MAYA;
    const list = await GET(new Request("http://localhost"), ctx(id));
    expect(list.status).toBe(200);
    expect(PlanPhotosResponse.parse(await list.json()).photos[0].userId).toBe(SAM);
  });

  it("outsider → 403, not a picture → 415, wrong field → 400 (never 404)", async () => {
    auth.id = SAM;
    const id = await livePlan();
    expect((await upload(id, new Uint8Array([1, 2, 3, 4]))).status).toBe(415);
    expect((await upload(id, JPEG, "file")).status).toBe(400);
    auth.id = LEA;
    expect((await upload(id, JPEG)).status).toBe(403);
    expect((await GET(new Request("http://localhost"), ctx(id))).status).toBe(403);
  });
});
