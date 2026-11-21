import { describe, expect, it } from "vitest";
import { Place } from "@/types/domain";
import {
  ASSUMED_HOURS, REGISTRY_ID_MIN, boundingBox, businessIdFrom, displayName, isRegistryPlaceId, pickRegistryPlaces, registryIdFor, registryRowToPlace,
} from "./registry";
import { haversineKm } from "./geo";

const row = (over = {}) => ({ business_id: 111786, name: "SINGH'S CUISINE INDIENNE", address: "3712 Boulevard Saint-Laurent", city: "Montréal", type: "Restaurant", statut: "Ouvert", latitude: 45.514779, longitude: -73.574491, ...over });
const MCGILL = { lat: 45.5048, lng: -73.5772 };

describe("ids", () => {
  it("same business → same uuid, and back again; curated ids sort below the registry range", () => {
    const id = registryIdFor(111786);
    expect(id).toBe("20000000-0000-4000-8000-000000111786");
    expect(Place.shape.id.safeParse(id).success).toBe(true); // a valid uuid for the contract
    expect(businessIdFrom(id)).toBe(111786);
    expect(isRegistryPlaceId(id)).toBe(true);
    expect(isRegistryPlaceId("10000000-0000-4000-8000-000000000034")).toBe(false);
    expect("10000000-0000-4000-8000-000000000060" < REGISTRY_ID_MIN && id > REGISTRY_ID_MIN).toBe(true);
    expect(() => registryIdFor(-1)).toThrow();
  });
});

describe("displayName", () => {
  it.each([
    ["SINGH'S CUISINE INDIENNE", "Singh's Cuisine Indienne"],
    ["9488-8518 QUEBEC INC.(PALAIS TANDOORI MALWA)", "Palais Tandoori Malwa"],
    ["9433-6278 QUEBEC INC. (CHATEAU KABAB)", "Chateau Kabab"],
    ["EMILIA POULET GRILLÉ PORTUGAIS # 9533-7457 QUEBEC INC.", "Emilia Poulet Grillé Portugais"],
    ["CUISINE INDIENNE THALI INC", "Cuisine Indienne Thali"],
    ["RESTAURANT LA CASA GRECQUE", "Restaurant la Casa Grecque"],
    ["SUSHI SHOP / THAI EXPRESS", "Sushi Shop / Thai Express"],
  ])("%s → %s", (raw, expected) => expect(displayName(raw)).toBe(expected));
});

describe("registryRowToPlace", () => {
  it("valid Place + registry flags, assumed hours, cuisine tags from the name", () => {
    const p = registryRowToPlace(row());
    expect(Place.safeParse(p).success).toBe(true);
    expect(p).toMatchObject({
      id: "20000000-0000-4000-8000-000000111786", name: "Singh's Cuisine Indienne", category: "restaurant", tags: ["indian"],
      priceLevel: 2, photoUrl: "/fallback/restaurant.svg", typicalDurationMin: 60, indoor: true, source: "registry", hoursVerified: false,
    });
    expect(p.hours).toEqual(ASSUMED_HOURS);
    expect(Object.keys(p.hours)).toHaveLength(7);
  });

  it("null without coordinates or without a cuisine in the name", () => {
    expect(registryRowToPlace(row({ latitude: null }))).toBeNull();
    expect(registryRowToPlace(row({ name: "CHEZ GEORGES" }))).toBeNull();
  });
});

describe("pickRegistryPlaces", () => {
  const rows = [
    row({ business_id: 1, name: "TANDOORI FAR", latitude: 45.56, longitude: -73.57 }), // ~6.1 km
    row({ business_id: 2, name: "CURRY NEAR", latitude: 45.506, longitude: -73.578 }), // ~0.15 km
    row({ business_id: 3, name: "CURRY NEAR", latitude: 45.506, longitude: -73.578 }), // duplicate permit
    row({ business_id: 4, name: "PIZZA PLACE", latitude: 45.505, longitude: -73.577 }), // other cuisine
    row({ business_id: 5, name: "MASALA MID", latitude: 45.52, longitude: -73.58 }), // ~1.7 km
    row({ business_id: 6, name: "EPICERIE INDIENNE", latitude: 45.505, longitude: -73.577 }), // grocery
  ];

  it("cuisine only, inside the radius, nearest first, one per name+address", () => {
    const got = pickRegistryPlaces(rows, { cuisine: "indian", near: MCGILL, radiusKm: 6, limit: 40 });
    expect(got.map((p) => p.name)).toEqual(["Curry Near", "Masala Mid"]);
  });

  it("respects the limit", () => {
    expect(pickRegistryPlaces(rows, { cuisine: "indian", near: MCGILL, radiusKm: 6, limit: 1 })).toHaveLength(1);
  });

  it("drops the registry copy of a curated place (same name nearby), keeps different names nearby", () => {
    const curated = [{ id: "10000000-0000-4000-8000-000000000034", name: "Curry Near Bistro", lat: 45.5061, lng: -73.5781 }];
    const got = pickRegistryPlaces(rows, { cuisine: "indian", near: MCGILL, radiusKm: 6, limit: 40, curated: /** @type {any} */ (curated) });
    expect(got.map((p) => p.name)).toEqual(["Masala Mid"]);
  });
});

describe("boundingBox", () => {
  it("contains every point within the radius", () => {
    const box = boundingBox(MCGILL, 6);
    const east = { lat: MCGILL.lat, lng: box.maxLng };
    const north = { lat: box.maxLat, lng: MCGILL.lng };
    expect(haversineKm(MCGILL.lat, MCGILL.lng, east.lat, east.lng)).toBeCloseTo(6, 1);
    expect(haversineKm(MCGILL.lat, MCGILL.lng, north.lat, north.lng)).toBeCloseTo(6, 1);
  });
});
