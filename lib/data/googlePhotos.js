/**
 * Google Places (New) photos, server only. Owner: Adel. Used by app/api/photo/route.js.
 *
 * Google's rules this follows (developers.google.com/maps/documentation/places/web-service):
 *  - Place IDs may be stored indefinitely → data/google-places.json + places.google_place_id.
 *  - "You cannot cache a photo name. Also, the name can expire." → we never store it: each
 *    lookup asks Place Details for a fresh one, then the Photo media endpoint for a photoUri.
 *  - "You must always credit the author when displaying photos" → resolvePhoto() also returns
 *    authorAttributions + googleMapsUri; cards must show them (GET /api/photo?...&format=json).
 * The key never leaves the server; the browser only sees /api/photo and the final photoUri.
 */
import googlePlaces from "@/data/google-places.json";

const API = "https://places.googleapis.com/v1";
/** Google place IDs: URL-safe characters only. */
export const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
/** Photo resource names: places/{placeId}/photos/{photoRef}. */
export const NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const MAX_WIDTH_PX = 1080;
/** Resolved photoUri + attribution kept in memory this long, to avoid 2 paid calls per card view. */
const TTL_MS = 60 * 60 * 1000;

/** Categories with an image in public/fallback/ (place categories + event kinds). */
export const FALLBACK_CATEGORIES = new Set([
  "cafe", "restaurant", "bar", "park", "viewpoint", "activity", "event", "museum", "music", "sports", "arts",
]);

/** @param {string | null | undefined} category */
export function fallbackPath(category) {
  const c = (category ?? "").toLowerCase();
  return `/fallback/${FALLBACK_CATEGORIES.has(c) ? c : "default"}.svg`;
}

/** Only places we matched (data/google-places.json) can be looked up, so the route isn't an open proxy to our key. */
const ALLOWED = new Set(Object.values(googlePlaces).map((m) => m.googlePlaceId));
/** @param {string} id */
export const isKnownPlace = (id) => ALLOWED.has(id);

/**
 * @typedef {{ photoUri: string, attributions: { name: string, uri: string | null }[], googleMapsUri: string | null }} ResolvedPhoto
 */

/** @type {Map<string, { at: number, value: Promise<ResolvedPhoto | null> }>} */
const cache = (globalThis.__sqGooglePhotos ??= new Map());

/**
 * First photo of a Google place → a short-lived image URL plus who to credit. null = no photo.
 * Throws on network/API errors (the route turns that into the fallback image).
 * @param {string} googlePlaceId
 * @param {{ key?: string, fetchImpl?: typeof fetch, now?: number }} [opts]
 * @returns {Promise<ResolvedPhoto | null>}
 */
export function resolvePhoto(googlePlaceId, { key = process.env.GOOGLE_PLACES_KEY, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!key) return Promise.reject(new Error("GOOGLE_PLACES_KEY is not set"));
  if (!PLACE_ID_RE.test(googlePlaceId)) return Promise.reject(new Error("bad place id"));
  const hit = cache.get(googlePlaceId);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = lookup(googlePlaceId, key, fetchImpl);
  cache.set(googlePlaceId, { at: now, value });
  value.catch(() => cache.delete(googlePlaceId)); // don't remember failures
  return value;
}

/** @param {string} id @param {string} key @param {typeof fetch} fetchImpl */
async function lookup(id, key, fetchImpl) {
  const details = await fetchImpl(`${API}/places/${id}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" },
    signal: AbortSignal.timeout(5000),
  });
  if (!details.ok) throw new Error(`Place Details HTTP ${details.status}`);
  const photo = (await details.json())?.photos?.[0];
  if (!photo) return null;
  if (typeof photo.name !== "string" || !NAME_RE.test(photo.name)) throw new Error("unexpected photo name");

  const media = await fetchImpl(`${API}/${photo.name}/media?maxWidthPx=${MAX_WIDTH_PX}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!media.ok) throw new Error(`Place Photo HTTP ${media.status}`);
  const photoUri = (await media.json())?.photoUri;
  if (typeof photoUri !== "string" || !photoUri.startsWith("https://")) throw new Error("unexpected photoUri");

  return {
    photoUri,
    attributions: (photo.authorAttributions ?? [])
      .filter((a) => typeof a?.displayName === "string" && a.displayName.trim())
      .map((a) => ({ name: a.displayName.trim(), uri: typeof a.uri === "string" && a.uri.startsWith("https://") ? a.uri : null })),
    googleMapsUri: typeof photo.googleMapsUri === "string" && photo.googleMapsUri.startsWith("https://") ? photo.googleMapsUri : null,
  };
}

/** Test helper. */
export function clearPhotoCache() {
  cache.clear();
}
