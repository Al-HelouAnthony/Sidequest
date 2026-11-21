/**
 * Postal code → home location. Server only (uses ROUTING_API_KEY). Owner: Mhammad.
 * Only the first 3 characters are kept (the FSA, e.g. "H2T": neighbourhood-sized), never the full
 * code, and we look up that area's centre with OpenRouteService structured geocoding.
 * Only answers ORS marks as a postal-code match are accepted: for an unknown code it quietly returns
 * a city or the whole province instead, which must never become someone's home.
 * Search by province (region=Quebec), not city: "locality=Montreal" breaks Laval codes (H7…). Tested.
 * Any Québec code (G, H, J) is looked up; Adel's updateProfile then checks the point is inside HOME_AREA
 * (island + Laval + South Shore + West Island) and rejects the rest with "outside the Montréal area".
 */
const ORS_URL = "https://api.openrouteservice.org/geocode/search/structured";
const TIMEOUT_MS = 4000;
/** Canadian postal code: letter digit letter [space] digit letter digit. No D F I O Q U; first letter no W Z. */
const POSTAL = /^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])(?:\s?(\d[ABCEGHJ-NPRSTV-Z]\d))?$/;
/** Québec postal codes start with G (east), H (Montréal/Laval) or J (west, incl. the South Shore). */
const QUEBEC_FIRST_LETTERS = "GHJ";

/** Bad or unknown code (400), or lookup service down (503). The route returns `status` + `message`. */
export class PostalCodeError extends Error {
  /** @param {string} message @param {400 | 503} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * "h2t 1s6", "H2T1S6", "H2T-1S6" or "H2T" → "H2T". null if it isn't a Canadian postal code.
 * @param {unknown} input
 * @returns {string | null}
 */
export function toFsa(input) {
  const match = String(input ?? "").trim().toUpperCase().replace(/[-\s]+/g, " ").match(POSTAL);
  return match ? match[1] : null;
}

/** FSA → its centre. Each area is looked up once per server. @type {Map<string, { fsa: string, lat: number, lng: number }>} */
const cache = new Map();

/** Clears the cache (for tests). */
export function clearPostalCodeCache() {
  cache.clear();
}

/**
 * @param {unknown} input what the user typed
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} [opts] for tests
 * @returns {Promise<{ fsa: string, lat: number, lng: number }>}
 * @throws {PostalCodeError}
 */
export async function postalCodeToHome(input, { apiKey = process.env.ROUTING_API_KEY, fetchImpl = fetch } = {}) {
  const fsa = toFsa(input);
  if (!fsa) throw new PostalCodeError("That doesn't look like a postal code (e.g. H2T 1S6)", 400);
  if (!QUEBEC_FIRST_LETTERS.includes(fsa[0])) {
    throw new PostalCodeError("Sidequest only works in the Montréal area for now", 400);
  }
  const known = cache.get(fsa);
  if (known) return known;
  if (!apiKey) throw new PostalCodeError("Postal code lookup isn't set up. Try again later.", 503);

  let json;
  try {
    const url = `${ORS_URL}?postalcode=${fsa}&country=CA&region=Quebec&size=1`;
    const res = await fetchImpl(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ORS answered ${res.status}`);
    json = await res.json();
  } catch (e) {
    console.warn("[postalCode] lookup failed:", e instanceof Error ? e.message : e);
    throw new PostalCodeError("Couldn't look up that postal code. Try again.", 503);
  }

  const hit = json?.features?.[0];
  const [lng, lat] = hit?.geometry?.coordinates ?? [];
  const isRealMatch = hit?.properties?.layer === "postalcode" && String(hit.properties.name ?? "").toUpperCase() === fsa;
  if (!isRealMatch || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new PostalCodeError("We don't know that postal code", 400);
  }
  const home = { fsa, lat, lng };
  cache.set(fsa, home);
  return home;
}
