// N5 end to end (PLAN.md §12): PATCH /api/me { postalCode } with the REAL updateProfile (Adel's, mock mode)
// and the real travel times. Only the online postal-code lookup is faked (no network in tests).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeResponse } from "@/types/api";
import { getTravelTimes, getUser } from "@/lib/data";
import { mockPlaces } from "@/lib/mocks/places";

const SAM = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => SAM }));

/** What ORS answers for these areas (real values from a live check on 2026-11-21). */
const AREAS = {
  H2T: { fsa: "H2T", lat: 45.5232, lng: -73.5911 }, // Mile End
  H9R: { fsa: "H9R", lat: 45.4612, lng: -73.8148 }, // Pointe-Claire (West Island, inside HOME_AREA)
  G1R: { fsa: "G1R", lat: 46.806705, lng: -71.219252 }, // Québec City (outside HOME_AREA)
};
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/geo/postalCode", async (importOriginal) => ({ ...(await importOriginal()), postalCodeToHome: lookup }));

const { PATCH } = await import("./route");
const patch = (body) => PATCH(new Request("http://localhost/api/me", { method: "PATCH", body: JSON.stringify(body) }));
const placeIds = mockPlaces.map((p) => p.id);
const travelSignature = async () => (await getTravelTimes([SAM], placeIds)).map((t) => `${t.placeId}:${t.minutes}`).join("|");

beforeEach(() => {
  lookup.mockReset();
  lookup.mockImplementation(async (code) => AREAS[String(code).slice(0, 3).toUpperCase()]);
});

describe("N5: postal code → home → travel times (real updateProfile)", () => {
  it("PATCH { postalCode } saves the area's centre as my home", async () => {
    const res = await patch({ postalCode: "H2T 1S6" });
    expect(res.status).toBe(200);
    const { user } = MeResponse.parse(await res.json());
    expect(user.homeLat).toBeCloseTo(AREAS.H2T.lat);
    expect(user.homeLng).toBeCloseTo(AREAS.H2T.lng);
    const stored = await getUser(SAM);
    expect(stored?.homeLat).toBeCloseTo(AREAS.H2T.lat);
  });

  it("moving home changes my travel times (the N5 bug: everyone had the same ones)", async () => {
    await patch({ postalCode: "H2T 1S6" });
    const before = await travelSignature();
    const res = await patch({ postalCode: "H9R 1A1" });
    expect(res.status).toBe(200);
    expect(await travelSignature()).not.toBe(before);
  });

  it("a code outside the Montréal area is refused by Adel's HOME_AREA check (400, home unchanged)", async () => {
    await patch({ postalCode: "H2T 1S6" });
    const res = await patch({ postalCode: "G1R 4P5" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/outside the Montréal area/);
    expect((await getUser(SAM))?.homeLat).toBeCloseTo(AREAS.H2T.lat);
  });

  it("postal code + neighbourhood together is refused (400)", async () => {
    expect((await patch({ postalCode: "H2T 1S6", neighbourhoodId: "plateau" })).status).toBe(400);
  });
});
