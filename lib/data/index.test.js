import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";
import { haversineKm } from "./geo";

const MAYA = mockUsers[1].id;

// Every Supabase call fails, like a dead network or a wrong key.
vi.mock("./db", () => {
  const down = async () => {
    throw new Error("fetch failed");
  };
  const names = ["getUser", "getUsers", "listUsers", "getFriends", "getPlaces", "getPlace", "getBusyBlocks",
    "getTravelTimes", "getTagWeights", "setTagWeights", "recordInteraction", "getRecentInteractions",
    "ensureUser", "replaceBusyBlocks", "updateProfile", "userExists", "findRegistryRows", "getRegistryRow", "upsertPlace", "findRegistryRowsByName"];
  // addFriendship to the "ghost" user = the DB answering with a foreign-key violation (not an outage).
  const addFriendship = async (_a, b) => {
    if (b === "aaaaaaaa-0000-4000-8000-0000000000aa") throw Object.assign(new Error("friendships.insert failed (23503)"), { code: "23503" });
    throw new Error("fetch failed");
  };
  return { ...Object.fromEntries(names.map((n) => [n, down])), addFriendship, DEFAULT_HOME: { lat: 45.5048, lng: -73.5772 } };
});

/** Fresh import of lib/data with the given env (USE_MOCK_DATA etc. are read at import time). */
async function load(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./index");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  globalThis.__sqData = undefined; // the mock-mode in-memory store lives on globalThis: isolate tests
});

describe("mock friendships go both ways", () => {
  it("every demo user has friends; Maya (phone 2) has Sam, Karim and Léa", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    expect((await data.getFriends(MAYA)).map((f) => f.user.name).sort()).toEqual(["Karim", "Léa", "Sam"]);
    expect(await data.getFriends(DEMO_USER_ID)).toHaveLength(4);
    for (const u of mockUsers) expect((await data.getFriends(u.id)).length).toBeGreaterThan(0);
  });

  it("every row has its reverse with the same closeness", async () => {
    const { mockFriendships } = await import("@/lib/mocks/users");
    for (const f of mockFriendships) {
      expect(mockFriendships).toContainEqual({ userId: f.friendId, friendId: f.userId, closeness: f.closeness });
    }
  });
});

const NEW_ID = "aaaaaaaa-0000-4000-8000-00000000abcd";
const block = (over = {}) => ({ userId: NEW_ID, startAt: "2026-11-22T15:00:00.000Z", endAt: "2026-11-22T16:00:00.000Z", source: "google", ...over });

describe("ensureUser (mock mode)", () => {
  it("creates a new user with the McGill default home, and it's then visible to getUser", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    const u = await data.ensureUser({ id: NEW_ID, name: "  Oscar M ", avatarUrl: "https://pic" });
    expect(u).toEqual({ id: NEW_ID, name: "Oscar M", avatarUrl: "https://pic", homeLat: 45.5048, homeLng: -73.5772, interests: [] });
    expect(await data.getUser(NEW_ID)).toEqual(u);
  });

  it("never overwrites an existing user, and fills safe defaults", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const sam = await data.ensureUser({ id: DEMO_USER_ID, name: "Someone Else", avatarUrl: "" });
    expect(sam.name).toBe("Sam");
    const blank = await data.ensureUser({ id: "aaaaaaaa-0000-4000-8000-00000000beef", name: "", avatarUrl: null });
    expect(blank).toMatchObject({ name: "New user", avatarUrl: "" });
  });

  it("rejects a non-uuid id", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.ensureUser({ id: "nope", name: "x", avatarUrl: "" })).rejects.toThrow();
  });
});

describe("replaceBusyBlocks (mock mode)", () => {
  it("replaces that user's google blocks and they show up in getBusyBlocks", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const range = { start: "2026-11-22T00:00:00.000Z", end: "2026-11-23T00:00:00.000Z" };
    expect(await data.replaceBusyBlocks(NEW_ID, [block(), block({ startAt: "2026-11-22T18:00:00.000Z", endAt: "2026-11-22T19:00:00.000Z" })], "google")).toEqual({ imported: 2 });
    expect(await data.getBusyBlocks([NEW_ID], range)).toHaveLength(2);
    expect(await data.replaceBusyBlocks(NEW_ID, [], "google")).toEqual({ imported: 0 }); // calendar now empty
    expect(await data.getBusyBlocks([NEW_ID], range)).toHaveLength(0);
  });

  it("refuses blocks for another user, another source, 'seed', or ending before they start", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ userId: DEMO_USER_ID })])).rejects.toThrow(/passed for user/);
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ source: "manual" })], "google")).rejects.toThrow(/source/);
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ source: "seed" })], "seed")).rejects.toThrow();
    await expect(data.replaceBusyBlocks(NEW_ID, [block({ endAt: "2026-11-22T14:00:00.000Z" })])).rejects.toThrow(/ends before/);
  });
});

describe("userExists", () => {
  it("mock mode: true for demo users and ensured users, false otherwise", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    expect(await data.userExists(MAYA)).toBe(true);
    expect(await data.userExists(NEW_ID)).toBe(false);
    await data.ensureUser({ id: NEW_ID, name: "Oscar", avatarUrl: "" });
    expect(await data.userExists(NEW_ID)).toBe(true);
  });

  it("fails open when Supabase can't answer (an outage must not sign everyone out)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const data = await load({ USE_MOCK_DATA: "false" });
    expect(await data.userExists(NEW_ID)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("letting the request through"));
  });
});

describe("updateProfile (mock mode)", () => {
  it("sets home from the neighbourhood, dedupes interests, keeps other fields", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    const u = await data.updateProfile(MAYA, { neighbourhoodId: "verdun", interests: ["coffee", "views", "coffee"] });
    expect(u).toMatchObject({ name: "Maya", homeLat: 45.4591, homeLng: -73.5732, interests: ["coffee", "views"] });
    expect(await data.getUser(MAYA)).toEqual(u); // persisted for later reads
    expect((await data.getFriends(DEMO_USER_ID)).find((f) => f.user.id === MAYA)?.user.homeLat).toBe(45.4591);
  });

  it("home from the postal-code lookup sets the coordinates and keeps other fields", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    const u = await data.updateProfile(MAYA, { home: { lat: 45.5232, lng: -73.6005 }, interests: ["coffee"] }); // H2T
    expect(u).toMatchObject({ name: "Maya", homeLat: 45.5232, homeLng: -73.6005, interests: ["coffee"] });
    expect(await data.getUser(MAYA)).toEqual(u);
    // Laval and Longueuil count as Montréal area
    await expect(data.updateProfile(MAYA, { home: { lat: 45.57, lng: -73.72 } })).resolves.toMatchObject({ homeLat: 45.57 });
    await expect(data.updateProfile(MAYA, { home: { lat: 45.53, lng: -73.52 } })).resolves.toMatchObject({ homeLng: -73.52 });
  });

  it("mock travel times follow the edited home (and cover ensured users)", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    const placeIds = (await data.getPlaces()).map((p) => p.id);
    const before = await data.getTravelTimes([MAYA], placeIds);
    await data.updateProfile(MAYA, { home: { lat: 45.4591, lng: -73.5732 } }); // Verdun
    const after = await data.getTravelTimes([MAYA], placeIds);
    expect(after).toHaveLength(placeIds.length);
    expect(after.map((t) => t.minutes)).not.toEqual(before.map((t) => t.minutes));
    await data.ensureUser({ id: NEW_ID, name: "Oscar", avatarUrl: "" });
    expect(await data.getTravelTimes([NEW_ID], placeIds)).toHaveLength(placeIds.length);
  });

  it("rejects bad homes with DataInputError: outside Montréal, swapped, not numbers, extra keys, or with a neighbourhood", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const bad = [
      { home: { lat: 46.8139, lng: -71.208 } }, // Québec City
      { home: { lat: -73.6, lng: 45.52 } }, // lat/lng swapped
      { home: { lat: NaN, lng: -73.6 } },
      { home: { lat: Infinity, lng: -73.6 } },
      { home: { lat: "45.5", lng: "-73.6" } },
      { home: { lat: 45.5 } },
      { home: { lat: 45.5, lng: -73.6, fsa: "H2T" } },
      { home: { lat: 45.5, lng: -73.6 }, neighbourhoodId: "verdun" },
    ];
    for (const input of bad) await expect(data.updateProfile(MAYA, input)).rejects.toBeInstanceOf(data.DataInputError);
    await expect(data.updateProfile(MAYA, bad[0])).rejects.toThrow(/outside the Montréal area/);
  });

  it("returns null for an unknown user", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    expect(await data.updateProfile(NEW_ID, { interests: ["coffee"] })).toBeNull();
  });

  it("rejects unknown neighbourhoods, unknown tags, raw coordinates and empty names", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.updateProfile(MAYA, { neighbourhoodId: "brooklyn" })).rejects.toThrow(/Unknown neighbourhood/);
    await expect(data.updateProfile(MAYA, { interests: ["coffee", "japanese"] })).rejects.toThrow(/Unknown interests: japanese/);
    await expect(data.updateProfile(MAYA, { homeLat: 1, homeLng: 2 })).rejects.toBeInstanceOf(data.DataInputError);
    await expect(data.updateProfile(MAYA, { name: "   " })).rejects.toBeInstanceOf(data.DataInputError);
    await expect(data.updateProfile("nope", {})).rejects.toBeInstanceOf(data.DataInputError);
  });
});

describe("addFriendship (mock mode)", () => {
  it("adds both directions with default closeness 2, and re-adding changes nothing", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    const ANTOINE = mockUsers[3].id;
    expect((await data.getFriends(MAYA)).some((f) => f.user.id === ANTOINE)).toBe(false);
    await data.addFriendship(MAYA, ANTOINE);
    await data.addFriendship(ANTOINE, MAYA, 3); // already friends: no-op
    expect((await data.getFriends(MAYA)).filter((f) => f.user.id === ANTOINE)).toEqual([{ user: expect.objectContaining({ id: ANTOINE }), closeness: 2 }]);
    expect((await data.getFriends(ANTOINE)).filter((f) => f.user.id === MAYA)).toHaveLength(1);
  });

  it("rejects self-friending, bad ids and closeness outside 1–3", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.addFriendship(MAYA, MAYA)).rejects.toThrow(/yourself/);
    await expect(data.addFriendship(MAYA, "nope")).rejects.toBeInstanceOf(data.DataInputError);
    await expect(data.addFriendship(MAYA, DEMO_USER_ID, 4)).rejects.toThrow(/Closeness/);
  });
});

const MCGILL = { lat: 45.5048, lng: -73.5772 };
const REGISTRY_INDIAN = "20000000-0000-4000-8000-000000132422"; // a real row in lib/mocks/registry.js (checked below)

describe("searchRegistry (mock mode: real 30-row sample)", () => {
  it("indian near McGill → only Indian registry restaurants, nearest first, flagged as unverified", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const got = await data.searchRegistry({ cuisine: "indian", near: MCGILL });
    expect(got.length).toBeGreaterThanOrEqual(2);
    for (const p of got) {
      expect(p).toMatchObject({ category: "restaurant", source: "registry", hoursVerified: false });
      expect(p.tags).toContain("indian");
      expect(data.isRegistryPlaceId(p.id)).toBe(true);
    }
    const d = got.map((p) => haversineKm(MCGILL.lat, MCGILL.lng, p.lat, p.lng));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("pizza → only pizza; the limit applies", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const got = await data.searchRegistry({ cuisine: "pizza", near: MCGILL, limit: 2 });
    expect(got).toHaveLength(2);
    expect(got.every((p) => p.tags.includes("pizza"))).toBe(true);
  });

  it("bad input → DataInputError (unknown cuisine, outside Montréal, silly radius)", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.searchRegistry({ cuisine: "klingon", near: MCGILL })).rejects.toThrow(/Unknown cuisine/);
    await expect(data.searchRegistry({ cuisine: "indian", near: { lat: 46.81, lng: -71.21 } })).rejects.toThrow(/outside the Montréal area/);
    await expect(data.searchRegistry({ cuisine: "indian", near: MCGILL, radiusKm: 500 })).rejects.toBeInstanceOf(data.DataInputError);
  });
});

describe("searchRegistryByName (mock mode: real 30-row sample)", () => {
  it("finds by whole words (accents/case ignored), keeps no-cuisine names, nearest first", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    const got = await data.searchRegistryByName({ text: "Garage", near: MCGILL });
    expect(got.map((p) => p.name)).toEqual(["Garage Beirut"]);
    expect(got[0]).toMatchObject({ source: "registry", hoursVerified: false });
    const sushi = await data.searchRegistryByName({ text: "SUSHI", near: MCGILL });
    expect(sushi.length).toBeGreaterThanOrEqual(2);
    expect(sushi.every((p) => /sushi/i.test(p.name))).toBe(true);
  });

  it("nothing found or empty text → [] (never throws for that); bad point → DataInputError", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    expect(await data.searchRegistryByName({ text: "zzzz nowhere", near: MCGILL })).toEqual([]);
    expect(await data.searchRegistryByName({ text: "  !! ", near: MCGILL })).toEqual([]);
    await expect(data.searchRegistryByName({ text: "pizza", near: { lat: 46.81, lng: -71.21 } })).rejects.toBeInstanceOf(data.DataInputError);
  });
});

const VENUE_ID = "40000000-0000-4000-8000-103152678294";
/** What Mhammad's venueToPlace returns for a venue row (shape copied from lib/geo/venues.js). */
const venuePlace = (over = {}) => ({
  id: VENUE_ID, name: "Salon de Quilles Darling", category: "activity", tags: ["bowling", "bowling", "quilles"],
  lat: 45.5389, lng: -73.6005, address: "Montréal", priceLevel: 2, photoUrl: "/fallback/sports.svg",
  hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ open: "11:00", close: "23:00" }]])),
  typicalDurationMin: 120, indoor: true, hoursVerified: false, ...over,
});

describe("ensurePlaceFromVenue (mock mode)", () => {
  it("saves the venue so getPlace / getTravelTimes know it (hoursVerified false), never in the normal feed", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    expect(data.isVenuePlaceId(VENUE_ID)).toBe(true);
    const saved = await data.ensurePlaceFromVenue(venuePlace());
    expect(saved).toMatchObject({ id: VENUE_ID, hoursVerified: false, category: "activity" });
    expect(await data.ensurePlaceFromVenue(venuePlace())).toEqual(saved); // idempotent
    expect(await data.getPlace(VENUE_ID)).toMatchObject({ id: VENUE_ID, hoursVerified: false });
    expect(await data.getTravelTimes([MAYA], [VENUE_ID])).toHaveLength(1);
    expect((await data.getPlaces()).some((p) => p.id === VENUE_ID)).toBe(false);
  });

  it("no venue, a non-venue id, or a broken place → DataInputError", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.ensurePlaceFromVenue(null)).rejects.toThrow(/Unknown venue/);
    await expect(data.ensurePlaceFromVenue(venuePlace({ id: "10000000-0000-4000-8000-000000000003" }))).rejects.toThrow(/Not a venue id/);
    await expect(data.ensurePlaceFromVenue(venuePlace({ id: REGISTRY_INDIAN }))).rejects.toBeInstanceOf(data.DataInputError);
    await expect(data.ensurePlaceFromVenue(venuePlace({ priceLevel: 9 }))).rejects.toThrow(/Invalid venue place/);
  });
});

describe("ensurePlaceFromRegistry (mock mode)", () => {
  it("curated id → null (nothing to do)", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    expect(await data.ensurePlaceFromRegistry("10000000-0000-4000-8000-000000000003")).toBeNull();
  });

  it("registry id → saved place that getPlace and getTravelTimes now know, with its flags; rebuilt from the registry, not the input", async () => {
    globalThis.__sqData = undefined;
    const data = await load({ USE_MOCK_DATA: "true" });
    const { mockRegistryRows } = await import("@/lib/mocks/registry");
    expect(mockRegistryRows.some((r) => r.business_id === 132422)).toBe(true);
    const saved = await data.ensurePlaceFromRegistry({ id: REGISTRY_INDIAN, name: "Hacked name", priceLevel: 1 });
    expect(saved).toMatchObject({ id: REGISTRY_INDIAN, source: "registry", hoursVerified: false, tags: ["indian"] });
    expect(saved.name).not.toBe("Hacked name");
    expect(await data.getPlace(REGISTRY_INDIAN)).toEqual(saved);
    expect(await data.getTravelTimes([MAYA], [REGISTRY_INDIAN])).toHaveLength(1);
    expect((await data.getPlaces()).some((p) => p.id === REGISTRY_INDIAN)).toBe(false); // never joins the normal feed
  });

  it("unknown registry restaurant → DataInputError", async () => {
    const data = await load({ USE_MOCK_DATA: "true" });
    await expect(data.ensurePlaceFromRegistry("20000000-0000-4000-8000-999999999999")).rejects.toBeInstanceOf(data.DataInputError);
  });
});

describe("Supabase failure", () => {
  it("searchRegistry falls back to the sample; ensurePlaceFromRegistry / ensurePlaceFromVenue never fake a saved place", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await load({ USE_MOCK_DATA: "false" });
    expect((await data.searchRegistry({ cuisine: "indian", near: MCGILL })).length).toBeGreaterThan(0);
    await expect(data.ensurePlaceFromRegistry(REGISTRY_INDIAN)).rejects.toThrow("fetch failed");
    await expect(data.ensurePlaceFromVenue(venuePlace())).rejects.toThrow("fetch failed");
  });

  it("a foreign-key violation is a real answer: DataInputError, no fake success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await load({ USE_MOCK_DATA: "false" });
    await expect(data.addFriendship(MAYA, "aaaaaaaa-0000-4000-8000-0000000000aa")).rejects.toBeInstanceOf(data.DataInputError);
    await expect(data.addFriendship(MAYA, mockUsers[3].id)).rejects.toThrow("fetch failed"); // outage: account writes never fake success
  });

  it("account-setup writes never fall back to memory: an outage throws instead of a phantom users row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await load({ USE_MOCK_DATA: "false" });
    await expect(data.ensureUser({ id: NEW_ID, name: "Oscar", avatarUrl: "" })).rejects.toThrow("fetch failed");
    await expect(data.updateProfile(MAYA, { interests: ["coffee"] })).rejects.toThrow("fetch failed");
    await expect(data.replaceBusyBlocks(NEW_ID, [block()])).rejects.toThrow("fetch failed");
    expect(globalThis.__sqData?.users?.has(NEW_ID) ?? false).toBe(false); // nothing landed in memory
  });

  it("falls back to mock data and logs it (default)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await load({ USE_MOCK_DATA: "false" });
    expect((await data.getUser(DEMO_USER_ID))?.name).toBe("Sam");
    expect(await data.getFriends(MAYA)).toHaveLength(3);
    expect((await data.getPlaces()).length).toBeGreaterThan(0);
    const saved = await data.recordInteraction(DEMO_USER_ID, { placeId: mockUsers[0].id, slotStart: "2026-11-22T19:00:00.000Z", action: "skip" });
    expect(saved.action).toBe("skip");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("falling back to mock data: fetch failed"));
  });

  it("throws when DATA_FALLBACK=false", async () => {
    const data = await load({ USE_MOCK_DATA: "false", DATA_FALLBACK: "false" });
    await expect(data.getUser(DEMO_USER_ID)).rejects.toThrow("fetch failed");
  });
});
