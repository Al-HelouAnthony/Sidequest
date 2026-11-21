import { describe, expect, it, vi } from "vitest";
import { MeResponse } from "@/types/api";
import { findNeighbourhood } from "@/lib/neighbourhoods";
import { INTEREST_TAGS } from "@/lib/interests";

import { mockUsers } from "@/lib/mocks/users";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));

// Postal code lookup: fake (no network). updateProfile: the real one, but watched so we can see what the route sends.
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/geo/postalCode", async (importOriginal) => ({ ...(await importOriginal()), postalCodeToHome: lookup }));
vi.mock("@/lib/data", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, updateProfile: vi.fn(real.updateProfile) };
});
const { updateProfile } = await import("@/lib/data");
const { PostalCodeError } = await import("@/lib/geo/postalCode");

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

  it("postal code: the area's centre is sent to updateProfile as the home (never the code itself)", async () => {
    lookup.mockResolvedValueOnce({ fsa: "H2T", lat: 45.5232, lng: -73.5911 });
    updateProfile.mockResolvedValueOnce(mockUsers[0]);
    const res = await patch({ postalCode: "H2T 1S6", interests: [INTEREST_TAGS[0]] });
    expect(res.status).toBe(200);
    expect(lookup).toHaveBeenLastCalledWith("H2T 1S6");
    expect(updateProfile).toHaveBeenLastCalledWith(SAM, { home: { lat: 45.5232, lng: -73.5911 }, interests: [INTEREST_TAGS[0]] });
  });

  it("bad postal code gives 400 with a clear message", async () => {
    lookup.mockRejectedValueOnce(new PostalCodeError("We don't know that postal code", 400));
    const res = await patch({ postalCode: "H0Z 0Z0" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("We don't know that postal code");
  });

  it("postal code lookup down gives 503", async () => {
    lookup.mockRejectedValueOnce(new PostalCodeError("Couldn't look up that postal code. Try again.", 503));
    expect((await patch({ postalCode: "H2T 1S6" })).status).toBe(503);
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
