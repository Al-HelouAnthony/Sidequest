import { describe, expect, it, vi } from "vitest";
import { MeResponse } from "@/types/api";
import { findNeighbourhood } from "@/lib/neighbourhoods";
import { INTEREST_TAGS } from "@/lib/interests";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));

const { PATCH } = await import("./route");
const patch = (body) =>
  PATCH(new Request("http://localhost/api/me", { method: "PATCH", body: JSON.stringify(body) }));

describe("PATCH /api/me", () => {
  it("a neighbourhood moves my home to its centre, interests are saved", async () => {
    const res = await patch({ neighbourhoodId: "plateau", interests: [INTEREST_TAGS[0], INTEREST_TAGS[1]] });
    expect(res.status).toBe(200);
    const { user } = MeResponse.parse(await res.json());
    const plateau = findNeighbourhood("plateau");
    expect(user.id).toBe(SAM);
    expect(user.homeLat).toBeCloseTo(plateau.lat);
    expect(user.homeLng).toBeCloseTo(plateau.lng);
    expect(user.interests).toEqual([INTEREST_TAGS[0], INTEREST_TAGS[1]]);
  });

  it("unknown neighbourhood gives 400", async () => {
    expect((await patch({ neighbourhoodId: "atlantis" })).status).toBe(400);
  });

  it("unknown interest gives 400", async () => {
    expect((await patch({ interests: ["not-a-tag"] })).status).toBe(400);
  });

  it("bad body gives 400", async () => {
    expect((await patch({ interests: "coffee" })).status).toBe(400);
  });
});
