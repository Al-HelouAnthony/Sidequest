/**
 * Every kind of Montréal venue for SEARCH (hotels, bowling, karaoke, cinemas, museums, climbing, bars,
 * cafés…). Owner: Mhammad. Data: OpenStreetMap (© OpenStreetMap contributors, ODbL, already credited in
 * the You tab), downloaded once on 2026-11-21 into lib/geo/venues.json (2,545 named venues, Montréal +
 * close Laval/South Shore). Read from memory: instant, nothing can fail on stage.
 *
 * Search-only for now: these become Place objects with ASSUMED hours (hoursVerified: false → "call ahead")
 * that /api/search adds to the engine context. They are NOT in the places table, so making a plan at one
 * needs a follow-up (like Adel's ensurePlaceFromRegistry for registry restaurants).
 */
import VENUES from "./venues.json";
import { haversineKm } from "@/lib/data/geo";
import { normalize } from "@/lib/ai/normalize";
import { placeMatches } from "@/lib/ai/searchTerms";

/** @typedef {{ id: string, name: string, kind: string, lat: number, lng: number, address?: string, hours?: string, url?: string, phone?: string }} VenueRow */

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
/** @param {string} open @param {string} close */
const everyDay = (open, close) => Object.fromEntries(DAYS.map((d) => [d, [{ open, close }]]));

/**
 * How each kind shows up in the app: category, words it matches (on top of its name), typical visit,
 * assumed hours (OSM hours are free text, not parsed: "call ahead" is shown either way), photo.
 * @type {Record<string, { category: import("@/types/domain").CategoryT, tags: string[], minutes: number, open: string, close: string, photo: string, indoor?: boolean }>}
 */
const KINDS = {
  hotel: { category: "activity", tags: ["hotel", "hotels", "hôtel"], minutes: 90, open: "10:00", close: "23:00", photo: "default" },
  bowling: { category: "activity", tags: ["bowling", "quilles"], minutes: 120, open: "11:00", close: "23:00", photo: "sports" },
  "escape-room": { category: "activity", tags: ["escape room", "escape game", "jeux d evasion"], minutes: 90, open: "11:00", close: "22:00", photo: "activity" },
  karaoke: { category: "bar", tags: ["karaoke"], minutes: 120, open: "18:00", close: "02:00", photo: "music" },
  climbing: { category: "activity", tags: ["climbing", "escalade", "bouldering"], minutes: 120, open: "10:00", close: "22:00", photo: "sports" },
  billiards: { category: "bar", tags: ["billiards", "billard", "pool hall"], minutes: 120, open: "12:00", close: "01:00", photo: "bar" },
  arcade: { category: "activity", tags: ["arcade"], minutes: 90, open: "11:00", close: "23:00", photo: "activity" },
  skating: { category: "activity", tags: ["skating", "patinoire", "rink"], minutes: 90, open: "10:00", close: "22:00", photo: "sports" },
  minigolf: { category: "activity", tags: ["minigolf", "mini golf"], minutes: 60, open: "11:00", close: "22:00", photo: "activity", indoor: false },
  trampoline: { category: "activity", tags: ["trampoline"], minutes: 90, open: "10:00", close: "21:00", photo: "sports" },
  "water-park": { category: "park", tags: ["water park", "outdoors"], minutes: 180, open: "10:00", close: "19:00", photo: "park", indoor: false },
  spa: { category: "activity", tags: ["spa", "sauna", "thermal"], minutes: 150, open: "10:00", close: "22:00", photo: "default" },
  animals: { category: "activity", tags: ["zoo", "aquarium", "animals"], minutes: 150, open: "09:00", close: "17:00", photo: "museum" },
  museum: { category: "activity", tags: ["museums", "museum", "musee"], minutes: 120, open: "10:00", close: "17:00", photo: "museum" },
  gallery: { category: "activity", tags: ["art", "gallery", "galerie"], minutes: 60, open: "11:00", close: "18:00", photo: "arts" },
  cinema: { category: "event", tags: ["cinema", "movies"], minutes: 150, open: "12:00", close: "23:00", photo: "event" },
  theatre: { category: "event", tags: ["theatre", "theater"], minutes: 150, open: "18:00", close: "23:00", photo: "arts" },
  "arts-centre": { category: "activity", tags: ["art", "arts centre"], minutes: 90, open: "11:00", close: "21:00", photo: "arts" },
  "music-venue": { category: "bar", tags: ["live music", "concert", "jazz"], minutes: 150, open: "19:00", close: "02:00", photo: "music" },
  // The app plans until 23:00, so a club night is suggested as 21:00–23:00 (assumed opening 20:00).
  nightclub: { category: "bar", tags: ["nightclub", "clubbing", "dancing", "late night"], minutes: 120, open: "20:00", close: "03:00", photo: "music" },
  library: { category: "activity", tags: ["library", "bibliotheque", "free"], minutes: 90, open: "10:00", close: "20:00", photo: "default" },
  bar: { category: "bar", tags: ["bars", "bar", "drinks"], minutes: 120, open: "16:00", close: "02:00", photo: "bar" },
  "ice-cream": { category: "cafe", tags: ["dessert", "ice cream", "gelato", "glace"], minutes: 45, open: "12:00", close: "22:00", photo: "cafe" },
  cafe: { category: "cafe", tags: ["coffee", "cafe"], minutes: 60, open: "08:00", close: "20:00", photo: "cafe" },
};

/** @type {VenueRow[]} */
const ROWS = /** @type {VenueRow[]} */ (VENUES).filter((v) => KINDS[v.kind]);

/**
 * A venue as a Place the engine understands (search-only, assumed hours).
 * @param {VenueRow} v
 * @returns {import("@/types/domain").PlaceT}
 */
export function venueToPlace(v) {
  const k = KINDS[v.kind];
  return {
    id: v.id,
    name: v.name,
    category: k.category,
    tags: [v.kind, ...k.tags],
    lat: v.lat,
    lng: v.lng,
    address: v.address ?? "Montréal",
    priceLevel: 2,
    photoUrl: `/fallback/${k.photo}.svg`,
    hours: everyDay(k.open, k.close),
    typicalDurationMin: k.minutes,
    indoor: k.indoor ?? true,
    hoursVerified: false,
  };
}

/**
 * The venue with this id as a Place (built here, server-side), or null. For plans at a venue:
 * plans-store passes it to Adel's ensurePlaceFromVenue, never anything from the request body.
 * @param {string} id
 * @returns {import("@/types/domain").PlaceT | null}
 */
export const venuePlaceById = (id) => {
  const v = ROWS.find((r) => r.id === id);
  return v ? venueToPlace(v) : null;
};

/** Lazily built Places (2,545, once per server). @type {import("@/types/domain").PlaceT[] | null} */
let places = null;
const allPlaces = () => (places ??= ROWS.map(venueToPlace));

/**
 * Nearest first, within `radiusKm`, skipping copies of places already in the app (same name, < 300 m).
 * @param {import("@/types/domain").PlaceT[]} found
 * @param {{ lat: number, lng: number }} near
 * @param {{ radiusKm: number, limit: number, existing?: { name: string, lat: number, lng: number }[] }} opts
 */
function nearest(found, near, { radiusKm, limit, existing = [] }) {
  const known = existing.map((p) => ({ key: normalize(p.name), lat: p.lat, lng: p.lng }));
  return found
    .map((p) => ({ p, km: haversineKm(near.lat, near.lng, p.lat, p.lng) }))
    .filter(({ p, km }) => km <= radiusKm && !known.some((e) => e.key === normalize(p.name) && haversineKm(e.lat, e.lng, p.lat, p.lng) < 0.3))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map(({ p }) => p);
}

/**
 * Venues of the specific things asked for ("bowling", "hotel", "museum"…), matched on kind + name.
 * @param {import("@/lib/ai/searchTerms").SearchTerm[]} terms
 * @param {{ lat: number, lng: number }} near
 * @param {{ radiusKm?: number, limit?: number, existing?: { name: string, lat: number, lng: number }[] }} [opts]
 */
export function venuesForTerms(terms, near, { radiusKm = 6, limit = 25, existing } = {}) {
  if (terms.length === 0) return [];
  return nearest(allPlaces().filter((p) => placeMatches(p, terms)), near, { radiusKm, limit, existing });
}

/**
 * Venues whose NAME contains every word ("o four", "cinema du parc", "salon de quilles darling").
 * @param {string} text normalized words from parseSearch (nameQuery)
 * @param {{ lat: number, lng: number }} near
 * @param {{ radiusKm?: number, limit?: number, existing?: { name: string, lat: number, lng: number }[] }} [opts]
 */
export function venuesByName(text, near, { radiusKm = 10, limit = 15, existing } = {}) {
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const hit = allPlaces().filter((p) => {
    const hay = normalize(p.name);
    return words.every((w) => hay.includes(` ${w} `));
  });
  return nearest(hit, near, { radiusKm, limit, existing });
}

/**
 * Broad searches ("a bar", "coffee tonight" → categories): the nearest venues of those categories.
 * @param {import("@/types/domain").CategoryT[]} categories
 * @param {{ lat: number, lng: number }} near
 * @param {{ radiusKm?: number, limit?: number, existing?: { name: string, lat: number, lng: number }[] }} [opts]
 */
export function venuesForCategories(categories, near, { radiusKm = 5, limit = 20, existing } = {}) {
  if (categories.length === 0) return [];
  return nearest(allPlaces().filter((p) => categories.includes(p.category)), near, { radiusKm, limit, existing });
}

/** How many venues of each kind (for tests / debugging). */
export const venueKinds = () => Object.keys(KINDS);
