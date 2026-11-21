/**
 * Match our places to Google Places (New) so /api/photo can show their Google photo. Owner: Adel.
 *
 *   node --env-file=.env.local data/fetch-google-places.mjs            dry run: show matches, write nothing
 *   node --env-file=.env.local data/fetch-google-places.mjs --apply    save the good matches
 *        --all                  also match places that already have a real photo (default: placeholders only)
 *        --accept <id,id,…>     also save these "CHECK" matches after you looked at them by eye
 *
 * Needs GOOGLE_PLACES_KEY (server only). One Text Search per place (~31 calls).
 * --apply writes:
 *   data/google-places.json   { <our place id>: { googlePlaceId, distanceM } }  (allowlist for /api/photo, read by the seed)
 *   data/places.json          photoUrl = /api/photo?place=<googlePlaceId>&category=<category> for matched placeholders
 * Then reseed (POST /api/dev/seed) so the DB gets the new photo_url + google_place_id.
 *
 * What we store, and why (Google's policies): place IDs only (allowed indefinitely). We keep OUR
 * hand-checked names, addresses, hours and prices: Google's may not be copied into our DB, and its
 * coordinates may only be cached 30 days. Google's name is printed for the by-eye check, never saved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLACES_FILE = path.join(DIR, "places.json");
const MATCHES_FILE = path.join(DIR, "google-places.json");
const SEARCH = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.location,places.photos";

/** Great-circle distance in metres. */
export function distanceM(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const STOP = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "et", "the", "of", "and", "a", "au", "aux", "montreal", "mtl"]);
const tokens = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((t) => t && !STOP.has(t));

/** Share of the shorter name's words found in the other name (0–1). "Café Olimpico" vs "Cafe Olimpico Mile End" = 1. */
export function nameScore(ours, theirs) {
  const a = new Set(tokens(ours));
  const b = new Set(tokens(theirs));
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let hit = 0;
  for (const t of small) if (big.has(t)) hit++;
  return hit / small.size;
}

/**
 * OK = save it, CHECK = look by eye (then --accept), NO = wrong place.
 * @param {number} dist metres  @param {number} score 0–1
 * @returns {"OK" | "CHECK" | "NO"}
 */
export function judge(dist, score) {
  if ((dist <= 150 && score >= 0.5) || (dist <= 40 && score > 0)) return "OK";
  if (dist <= 500 && score >= 0.34) return "CHECK";
  if (dist <= 60) return "CHECK"; // same spot, different name (e.g. a park's official name)
  return "NO";
}

/** Best of Google's candidates for one of our places. */
export function pickMatch(place, candidates = []) {
  const scored = candidates
    .filter((c) => c?.id && c.location)
    .map((c) => {
      const dist = distanceM(place, { lat: c.location.latitude, lng: c.location.longitude });
      const score = nameScore(place.name, c.displayName?.text ?? "");
      return { googlePlaceId: c.id, googleName: c.displayName?.text ?? "?", distanceM: dist, score, photos: c.photos?.length ?? 0, verdict: judge(dist, score) };
    });
  const rank = { OK: 0, CHECK: 1, NO: 2 };
  scored.sort((x, y) => rank[x.verdict] - rank[y.verdict] || y.score - x.score || x.distanceM - y.distanceM);
  return scored[0] ?? null;
}

/** No real photo yet: picsum (old), a category fallback image, or an earlier Google match (re-matchable). */
export const isPlaceholder = (p) => p.photoUrl.includes("picsum.photos") || p.photoUrl.startsWith("/fallback/") || p.photoUrl.startsWith("/api/photo");
const hasPhoto = (p) => !p.photoUrl.includes("picsum.photos") && !p.photoUrl.startsWith("/fallback/");
export const photoUrlFor = (googlePlaceId, category) => `/api/photo?place=${encodeURIComponent(googlePlaceId)}&category=${category}`;

async function search(place, key) {
  const res = await fetch(SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: `${place.name}, ${place.address}, Montréal`,
      locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 500 } },
      pageSize: 3,
      languageCode: "en",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Text Search HTTP ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body).places ?? [];
}

async function main() {
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) {
    console.error("GOOGLE_PLACES_KEY is not set. Add it to .env.local and run with: node --env-file=.env.local data/fetch-google-places.mjs");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const acceptArg = args.indexOf("--accept");
  const accept = new Set(acceptArg > -1 ? (args[acceptArg + 1] ?? "").split(",").filter(Boolean) : []);

  const places = JSON.parse(fs.readFileSync(PLACES_FILE, "utf8"));
  const saved = JSON.parse(fs.readFileSync(MATCHES_FILE, "utf8"));
  const targets = args.includes("--all") ? places : places.filter(isPlaceholder);
  console.log(`Matching ${targets.length} places against Google${apply ? "" : " (dry run, nothing written)"}...\n`);

  const counts = { OK: 0, CHECK: 0, NO: 0 };
  let updatedPhotos = 0;
  for (const place of targets) {
    let m = null;
    try {
      m = pickMatch(place, await search(place, key));
    } catch (e) {
      console.error(`  ! ${place.name}: ${e.message}`);
      if (/HTTP 40[13]/.test(e.message)) process.exit(1); // bad key / API not enabled: stop now
      continue;
    }
    const verdict = m ? (m.verdict === "CHECK" && accept.has(place.id) ? "OK" : m.verdict) : "NO";
    counts[verdict]++;
    const info = m ? `${m.googleName}  · ${m.distanceM} m · name ${Math.round(m.score * 100)}% · ${m.photos} photos` : "no result";
    console.log(`${verdict.padEnd(5)} ${place.name}  →  ${info}${verdict === "CHECK" ? `\n        accept with: --accept ${place.id}` : ""}`);

    if (apply && verdict === "OK" && m) {
      saved[place.id] = { googlePlaceId: m.googlePlaceId, distanceM: m.distanceM };
      if (m.photos > 0 && isPlaceholder(place)) {
        place.photoUrl = photoUrlFor(m.googlePlaceId, place.category);
        updatedPhotos++;
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nOK ${counts.OK} · CHECK ${counts.CHECK} · NO ${counts.NO}`);
  if (!apply) {
    console.log("Dry run. Look at the list, then re-run with --apply (and --accept <ids> for CHECK rows you confirmed).");
    return;
  }
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(saved, null, 2) + "\n");
  fs.writeFileSync(PLACES_FILE, JSON.stringify(places, null, 2));
  const withPhoto = places.filter(hasPhoto).length;
  console.log(`Saved ${Object.keys(saved).length} matches; ${updatedPhotos} places now use /api/photo. ${withPhoto}/${places.length} places have a photo.`);
  console.log("Next: npm test, then reseed (POST /api/dev/seed) so the DB gets the new photo URLs.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
