/**
 * GET /api/photo?place=<googlePlaceId>&category=<cafe|bar|…>             → 302 to the photo (or a fallback image)
 * GET /api/photo?place=<googlePlaceId>&category=<…>&format=json          → { photoUrl, attributions, googleMapsUri, fallback }
 * Owner: Adel. Proxies Google Places (New) photos so GOOGLE_PLACES_KEY stays on the server.
 * Logic + Google's rules: lib/data/googlePhotos.js. Any problem (no key, unknown place, Google down,
 * place without photos) → /fallback/<category>.svg, never a broken image.
 *
 * Cards showing a Google photo must show its attribution: "Photo: <name> · Google Maps" (format=json).
 */
import { fallbackPath, isKnownPlace, resolvePhoto } from "@/lib/data/googlePhotos";

const PHOTO_CACHE = "private, max-age=3600"; // matches the server-side TTL; photoUris are short-lived
const FALLBACK_CACHE = "private, max-age=300"; // retry Google soon after a failure

/** @param {import("next/server").NextRequest} request */
export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const place = params.get("place") ?? "";
  const fallback = fallbackPath(params.get("category"));
  const asJson = params.get("format") === "json";

  let photo = null;
  if (isKnownPlace(place)) {
    try {
      photo = await resolvePhoto(place);
    } catch (e) {
      console.error(`[api/photo] ${place}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (asJson) {
    const body = photo
      ? { photoUrl: photo.photoUri, attributions: photo.attributions, googleMapsUri: photo.googleMapsUri, fallback: false }
      : { photoUrl: fallback, attributions: [], googleMapsUri: null, fallback: true };
    return Response.json(body, { headers: { "Cache-Control": photo ? PHOTO_CACHE : FALLBACK_CACHE } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: photo ? photo.photoUri : new URL(fallback, request.url).toString(), "Cache-Control": photo ? PHOTO_CACHE : FALLBACK_CACHE },
  });
}
