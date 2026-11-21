import { afterEach, describe, expect, it, vi } from "vitest";

const GID = "ChIJ_test_place_0001";
vi.mock("@/data/google-places.json", () => ({ default: { "some-our-id": { googlePlaceId: "ChIJ_test_place_0001", distanceM: 12 } } }));

const { NAME_RE, clearPhotoCache, fallbackPath, isKnownPlace, resolvePhoto } = await import("./googlePhotos");
const { GET } = await import("@/app/api/photo/route");

const PHOTO_NAME = `places/${GID}/photos/AbC_123-x`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fake Google: Place Details then Photo media. */
function google({ photos = [{ name: PHOTO_NAME, authorAttributions: [{ displayName: " Jo Photographer ", uri: "https://maps.google.com/contrib/1" }], googleMapsUri: "https://maps.google.com/photo/1" }], detailsStatus = 200 } = {}) {
  return vi.fn(async (url) => {
    if (String(url).includes("/media?")) return json({ name: PHOTO_NAME, photoUri: "https://lh3.googleusercontent.com/p/xyz=w1080" });
    return json(detailsStatus === 200 ? { photos } : { error: {} }, detailsStatus);
  });
}

afterEach(() => {
  clearPhotoCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fallbackPath / NAME_RE / allowlist", () => {
  it("known categories get their own image, anything else the default", () => {
    expect(fallbackPath("cafe")).toBe("/fallback/cafe.svg");
    expect(fallbackPath("MUSIC")).toBe("/fallback/music.svg");
    expect(fallbackPath("../../etc/passwd")).toBe("/fallback/default.svg");
    expect(fallbackPath(null)).toBe("/fallback/default.svg");
  });
  it("photo names must look like places/{id}/photos/{ref}", () => {
    expect(NAME_RE.test(PHOTO_NAME)).toBe(true);
    expect(NAME_RE.test("places/x/photos/y/../../z")).toBe(false);
    expect(NAME_RE.test("https://evil.example/photos/y")).toBe(false);
  });
  it("only matched places are allowed", () => {
    expect(isKnownPlace(GID)).toBe(true);
    expect(isKnownPlace("ChIJsomethingElse")).toBe(false);
  });
});

describe("resolvePhoto", () => {
  it("asks Details for photos (key in header), then media with skipHttpRedirect, and returns uri + credit", async () => {
    const fetchImpl = google();
    const p = await resolvePhoto(GID, { key: "k", fetchImpl });
    expect(p).toEqual({
      photoUri: "https://lh3.googleusercontent.com/p/xyz=w1080",
      attributions: [{ name: "Jo Photographer", uri: "https://maps.google.com/contrib/1" }],
      googleMapsUri: "https://maps.google.com/photo/1",
    });
    const [detailsUrl, detailsInit] = fetchImpl.mock.calls[0];
    expect(detailsUrl).toBe(`https://places.googleapis.com/v1/places/${GID}`);
    expect(detailsInit.headers).toEqual({ "X-Goog-Api-Key": "k", "X-Goog-FieldMask": "photos" });
    expect(fetchImpl.mock.calls[1][0]).toBe(`https://places.googleapis.com/v1/${PHOTO_NAME}/media?maxWidthPx=1080&skipHttpRedirect=true&key=k`);
  });

  it("caches for an hour (2 calls, not 4), but never caches failures", async () => {
    const fetchImpl = google();
    await resolvePhoto(GID, { key: "k", fetchImpl, now: 0 });
    await resolvePhoto(GID, { key: "k", fetchImpl, now: 59 * 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await resolvePhoto(GID, { key: "k", fetchImpl, now: 61 * 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    clearPhotoCache();
    const failing = google({ detailsStatus: 403 });
    await expect(resolvePhoto(GID, { key: "k", fetchImpl: failing })).rejects.toThrow("403");
    await expect(resolvePhoto(GID, { key: "k", fetchImpl: google() })).resolves.not.toBeNull();
  });

  it("null when the place has no photos; throws without a key or with a weird photo name", async () => {
    expect(await resolvePhoto(GID, { key: "k", fetchImpl: google({ photos: [] }) })).toBeNull();
    clearPhotoCache();
    await expect(resolvePhoto(GID, { key: "", fetchImpl: google() })).rejects.toThrow("GOOGLE_PLACES_KEY");
    await expect(resolvePhoto(GID, { key: "k", fetchImpl: google({ photos: [{ name: "places/x/../secret" }] }) })).rejects.toThrow("photo name");
  });
});

describe("GET /api/photo", () => {
  const req = (qs) => /** @type {any} */ ({ nextUrl: new URL(`http://localhost:3000/api/photo?${qs}`), url: `http://localhost:3000/api/photo?${qs}` });

  it("redirects to the Google photo", async () => {
    vi.stubEnv("GOOGLE_PLACES_KEY", "k");
    vi.stubGlobal("fetch", google());
    const res = await GET(req(`place=${GID}&category=cafe`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://lh3.googleusercontent.com/p/xyz=w1080");
  });

  it("format=json returns the credit the card must show", async () => {
    vi.stubEnv("GOOGLE_PLACES_KEY", "k");
    vi.stubGlobal("fetch", google());
    const body = await (await GET(req(`place=${GID}&category=cafe&format=json`))).json();
    expect(body).toMatchObject({ fallback: false, attributions: [{ name: "Jo Photographer" }] });
  });

  it("falls back (never a broken image) for unknown places, no key, or Google errors, without calling Google for unknown places", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("GOOGLE_PLACES_KEY", "k");
    const unknown = await GET(req("place=ChIJnotOursAtAll&category=bar"));
    expect(unknown.headers.get("location")).toBe("http://localhost:3000/fallback/bar.svg");
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GOOGLE_PLACES_KEY", "");
    expect((await GET(req(`place=${GID}&category=park`))).headers.get("location")).toBe("http://localhost:3000/fallback/park.svg");

    vi.stubEnv("GOOGLE_PLACES_KEY", "k");
    vi.stubGlobal("fetch", google({ detailsStatus: 500 }));
    const body = await (await GET(req(`place=${GID}&category=nope&format=json`))).json();
    expect(body).toEqual({ photoUrl: "/fallback/default.svg", attributions: [], googleMapsUri: null, fallback: true });
  });
});
