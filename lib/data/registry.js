/**
 * City health-registry restaurants (public.businesses) → Place objects, for cuisine search (N1).
 * Owner: Adel. Pure functions (no I/O): db.js / index.js do the fetching.
 *
 * The registry only has name, address, coordinates, type and status. Everything else is ASSUMED
 * and flagged: hours 11:30–22:00 every day (hoursVerified: false → card says "call ahead"),
 * price $$, 60 min, indoor, category fallback photo. Cuisine tags are guessed from the name.
 *
 * Ids: registry places get `20000000-0000-4000-8000-<business_id, 12 digits>`, so the same restaurant
 * always has the same id (cards, plans, swipes line up) and the id leads back to its registry row.
 * Curated places are all `10000000-…`, so ids sort curated first: getPlaces() uses that to keep
 * registry rows (saved when someone makes a plan there) out of the normal feed.
 */
import { Place } from "@/types/domain";
import { cuisinesForName, normalizeName } from "@/lib/cuisines";
import { haversineKm } from "./geo";

/** @param {{ lat: number, lng: number }} a @param {{ lat: number, lng: number }} b */
const distanceKm = (a, b) => haversineKm(a.lat, a.lng, b.lat, b.lng);

/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {PlaceT & { source: "registry", hoursVerified: false }} RegistryPlaceT */
/**
 * @typedef {{ business_id: number, name: string, address: string, city?: string, type?: string,
 *   statut?: string, latitude: number | null, longitude: number | null }} BusinessRow
 */

const ID_PREFIX = "20000000-0000-4000-8000-";
/** Every registry id is >= this, every curated id is below it. */
export const REGISTRY_ID_MIN = "20000000-0000-0000-0000-000000000000";
export const REGISTRY_ID_RE = /^20000000-0000-4000-8000-(\d{12})$/;

export const ASSUMED_HOURS = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ open: "11:30", close: "22:00" }]]));

/** @param {number} businessId */
export function registryIdFor(businessId) {
  if (!Number.isInteger(businessId) || businessId < 0 || businessId > 999_999_999_999) throw new Error(`bad business_id ${businessId}`);
  return ID_PREFIX + String(businessId).padStart(12, "0");
}

/** @param {string} id @returns {number | null} business_id, or null if it isn't a registry id */
export function businessIdFrom(id) {
  const m = REGISTRY_ID_RE.exec(String(id));
  return m ? Number(m[1]) : null;
}

/** @param {string} id */
export const isRegistryPlaceId = (id) => businessIdFrom(id) !== null;

const SMALL = new Set(["de", "du", "des", "la", "le", "les", "et", "a", "à", "au", "aux", "en", "d", "l", "of", "the", "and", "y", "di", "da", "del"]);
const LEGAL = /\b(inc|ltee|ltée|enr|senc|s\.e\.n\.c|cie|limitee|limitée)\b\.?/gi;

/**
 * "9488-8518 QUEBEC INC.(PALAIS TANDOORI MALWA)" → "Palais Tandoori Malwa";
 * "SINGH'S CUISINE INDIENNE" → "Singh's Cuisine Indienne".
 * @param {string} raw
 */
export function displayName(raw) {
  let s = String(raw).replace(/\s+/g, " ").trim();
  s = s.replace(/#?\s*\d{4}-\d{4}\s+QU[EÉ]BEC\s+INC\.?/gi, " ").trim(); // numbered company
  const inParens = /^\((.+)\)$/.exec(s);
  if (inParens) s = inParens[1];
  s = s.replace(LEGAL, " ").replace(/\(\s*\)/g, " ").replace(/\s*#\s*$/, "").replace(/\s+/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "");
  if (!s) return String(raw).trim();
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/(^|[-'(/])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())))
    .join(" ")
    .replace(/'S\b/g, "'s");
}

/**
 * One registry row → a Place (validated against the contract) + the registry flags.
 * @param {BusinessRow} row
 * @returns {RegistryPlaceT | null} null when it has no coordinates or no recognisable cuisine
 */
export function registryRowToPlace(row) {
  if (row?.latitude == null || row?.longitude == null) return null;
  const tags = cuisinesForName(row.name);
  if (!tags.length) return null;
  const place = Place.parse({
    id: registryIdFor(row.business_id),
    name: displayName(row.name),
    category: "restaurant",
    tags,
    lat: row.latitude,
    lng: row.longitude,
    address: String(row.address ?? "").trim(),
    priceLevel: 2,
    photoUrl: "/fallback/restaurant.svg",
    hours: ASSUMED_HOURS,
    typicalDurationMin: 60,
    indoor: true,
  });
  // Not in the Place contract yet (N1 contract change, Anthony): spread back after parse() strips them.
  return { ...place, source: "registry", hoursVerified: false };
}

/**
 * Turn raw rows into search results: keep the cuisine, within radius, nearest first, one per
 * name+address, and drop registry copies of places we already curate (same name within 150 m).
 * @param {BusinessRow[]} rows
 * @param {{ cuisine: string, near: { lat: number, lng: number }, radiusKm: number, limit: number, curated?: PlaceT[] }} opts
 * @returns {RegistryPlaceT[]}
 */
export function pickRegistryPlaces(rows, { cuisine, near, radiusKm, limit, curated = [] }) {
  const tokens = (s) => new Set(normalizeName(s).trim().split(" ").filter((t) => t.length > 2 && t !== "restaurant"));
  const curatedTokens = curated.map((p) => ({ p, t: tokens(p.name) }));
  const isCuratedCopy = (place) => {
    const t = tokens(place.name);
    return curatedTokens.some(({ p, t: ct }) => distanceKm(place, p) <= 0.15 && [...ct].some((w) => t.has(w)));
  };

  const seen = new Set();
  return rows
    .map((r) => registryRowToPlace(r))
    .filter((p) => p !== null && p.tags.includes(cuisine))
    .map((p) => ({ p, d: distanceKm(near, p) }))
    .filter(({ d }) => d <= radiusKm)
    .sort((a, b) => a.d - b.d)
    .filter(({ p }) => {
      const key = `${normalizeName(p.name)}|${normalizeName(p.address)}`;
      if (seen.has(key) || isCuratedCopy(p)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ p }) => p);
}

/** Bounding box around a point (cheap database pre-filter before the exact distance check). */
export function boundingBox({ lat, lng }, radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
