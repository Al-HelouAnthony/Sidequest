import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPostalCodeCache, postalCodeToHome, toFsa } from "./postalCode";

/** A fake ORS answer. */
const ors = (feature, status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => ({ features: feature ? [feature] : [] }) }));
const match = (fsa, lat, lng) => ({ geometry: { coordinates: [lng, lat] }, properties: { layer: "postalcode", name: fsa } });
const opts = (fetchImpl) => ({ apiKey: "test-key", fetchImpl });

beforeEach(() => {
  clearPostalCodeCache();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("toFsa", () => {
  it("keeps only the first 3 characters, whatever the format", () => {
    for (const input of ["H2T 1S6", "h2t1s6", " H2T-1S6 ", "H2T", "h2t"]) expect(toFsa(input)).toBe("H2T");
  });

  it("rejects things that aren't postal codes", () => {
    for (const input of ["", "hello", "12345", "H2T 1S", "D2T 1S6", "H2T 1S66", null]) expect(toFsa(input)).toBeNull();
  });
});

describe("postalCodeToHome", () => {
  it("returns the area's centre, never the full code", async () => {
    const fetchImpl = ors(match("H2T", 45.5232, -73.5911));
    expect(await postalCodeToHome("H2T 1S6", opts(fetchImpl))).toEqual({ fsa: "H2T", lat: 45.5232, lng: -73.5911 });
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain("postalcode=H2T&");
    expect(url).not.toContain("1S6");
    expect(url).toContain("region=Quebec");
  });

  it("not a postal code, or outside Québec → 400, no lookup", async () => {
    const fetchImpl = ors(match("H2T", 1, 1));
    await expect(postalCodeToHome("hello", opts(fetchImpl))).rejects.toMatchObject({ status: 400 });
    await expect(postalCodeToHome("M5V 2T6", opts(fetchImpl))).rejects.toMatchObject({
      status: 400,
      message: "Sidequest only works in the Montréal area for now",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("South Shore (J) and Laval (H7) codes are looked up; the area check is Adel's updateProfile", async () => {
    expect(await postalCodeToHome("J4K 2T1", opts(ors(match("J4K", 45.53, -73.51))))).toEqual({ fsa: "J4K", lat: 45.53, lng: -73.51 });
    expect(await postalCodeToHome("H7N", opts(ors(match("H7N", 45.5596, -73.7038))))).toMatchObject({ fsa: "H7N" });
  });

  it("unknown area: ORS returns a city or the province instead → 400", async () => {
    const city = { geometry: { coordinates: [-73.58, 45.57] }, properties: { layer: "locality", name: "Montreal" } };
    const province = { geometry: { coordinates: [-72.7, 52.6] }, properties: { layer: "region", name: "Quebec" } };
    await expect(postalCodeToHome("H0Z", opts(ors(city)))).rejects.toMatchObject({ status: 400, message: "We don't know that postal code" });
    await expect(postalCodeToHome("H0Z", opts(ors(province)))).rejects.toMatchObject({ status: 400 });
    await expect(postalCodeToHome("H0Z", opts(ors(null)))).rejects.toMatchObject({ status: 400 });
  });

  it("a match for a different area is not accepted", async () => {
    await expect(postalCodeToHome("H2T", opts(ors(match("H2X", 45.5, -73.5))))).rejects.toMatchObject({ status: 400 });
  });

  it("service down or no key → 503", async () => {
    await expect(postalCodeToHome("H2T", opts(ors(null, 500)))).rejects.toMatchObject({ status: 503 });
    const crash = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(postalCodeToHome("H2T", opts(crash))).rejects.toMatchObject({ status: 503 });
    await expect(postalCodeToHome("H2T", { apiKey: "", fetchImpl: ors(null) })).rejects.toMatchObject({ status: 503 });
  });

  it("each area is looked up only once", async () => {
    const fetchImpl = ors(match("H3A", 45.5027, -73.5748));
    await postalCodeToHome("H3A 0G4", opts(fetchImpl));
    await postalCodeToHome("h3a 2t5", opts(fetchImpl));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
