/**
 * G1b: put hand-picked place photos in place, one command. Owner: Adel. macOS only (uses the built-in `sips`).
 *
 *   node data/import-place-photos.mjs ~/Desktop/place-photos            dry run: show what matches, write nothing
 *   node data/import-place-photos.mjs ~/Desktop/place-photos --apply    write public/places/<id>.jpg + credits
 *
 * The folder holds one picture per place, named after the place ("Café Olimpico.jpg"; accents, capitals and
 * punctuation don't matter; the place id also works), plus `sources.txt` with one line per picture:
 *     Café Olimpico | https://where-the-picture-came-from
 * Each picture is cropped to the card shape (3:4) and resized to 896×1200 JPEG, like the current ones, and
 * replaces public/places/<id>.jpg (photoUrl stays /places/<id>.jpg: no data change, no reseed).
 * data/photo-credits.md gets a "Place photos (G1b)" table with every source (kept between markers, so
 * re-running replaces it). Places without a picture keep their current image.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const W = 896;
const H = 1200;
const START = "<!-- G1B-START -->";
const END = "<!-- G1B-END -->";

/** "Café Olimpico!" → "cafe olimpico" */
export const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Match picture files to places by name (or id). @param {{ id: string, name: string }[]} places @param {string[]} files
 * @returns {{ matched: { place: { id: string, name: string }, file: string }[], unmatchedFiles: string[], missing: { id: string, name: string }[] }}
 */
export function matchPhotos(places, files) {
  const byKey = new Map(places.flatMap((p) => [[norm(p.name), p], [p.id.toLowerCase(), p]]));
  const matched = [];
  const unmatchedFiles = [];
  for (const f of files) {
    const base = f.replace(/\.[^.]+$/, "");
    const place = byKey.get(norm(base)) ?? byKey.get(base.toLowerCase());
    if (place && !matched.some((m) => m.place.id === place.id)) matched.push({ place, file: f });
    else unmatchedFiles.push(f);
  }
  const missing = places.filter((p) => !matched.some((m) => m.place.id === p.id));
  return { matched, unmatchedFiles, missing };
}

/** "Name | https://…" lines → Map(normalized name → url). @param {string} text */
export function parseSources(text) {
  const out = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(.+?)\s*\|\s*(https?:\/\/\S+)\s*$/.exec(line);
    if (m) out.set(norm(m[1]), m[2]);
  }
  return out;
}

/** The credits block (markdown table between markers). */
export function creditsBlock(rows) {
  const lines = rows.map((r) => `| ${r.name} | ${r.url ? `[source](${r.url})` : "**missing: add it to sources.txt**"} |`);
  return [START, "## Place photos (G1b)", "", "Hand-picked from Google Images (team decision, copyright risk accepted; keep this list).", "", "| Place | Source |", "|---|---|", ...lines, END].join("\n");
}

/** Crop to 3:4 around the centre, then resize to 896×1200 JPEG. */
export function convert(src, dest) {
  const info = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src]).toString();
  const w = Number(/pixelWidth: (\d+)/.exec(info)?.[1]);
  const h = Number(/pixelHeight: (\d+)/.exec(info)?.[1]);
  if (!w || !h) throw new Error("not an image sips can read");
  const [cw, ch] = w / h > W / H ? [Math.round((h * W) / H), h] : [w, Math.round((w * H) / W)];
  const tmp = path.join(os.tmpdir(), `place-${process.pid}-${path.basename(dest)}`);
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-c", String(ch), String(cw), src, "--out", tmp], { stdio: "ignore" });
  execFileSync("sips", ["-z", String(H), String(W), tmp, "--out", dest], { stdio: "ignore" });
  fs.rmSync(tmp, { force: true });
}

function main() {
  const [folderArg, ...rest] = process.argv.slice(2);
  const apply = rest.includes("--apply");
  if (!folderArg) {
    console.error("Usage: node data/import-place-photos.mjs <folder> [--apply]");
    process.exit(1);
  }
  const folder = folderArg.replace(/^~(?=$|\/)/, os.homedir());
  if (!fs.existsSync(folder)) {
    console.error(`Folder not found: ${folder}`);
    process.exit(1);
  }
  const places = JSON.parse(fs.readFileSync(path.join(DIR, "places.json"), "utf8"));
  const files = fs.readdirSync(folder).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
  const sourcesFile = path.join(folder, "sources.txt");
  const sources = fs.existsSync(sourcesFile) ? parseSources(fs.readFileSync(sourcesFile, "utf8")) : new Map();
  const { matched, unmatchedFiles, missing } = matchPhotos(places, files);
  const noSource = matched.filter((m) => !sources.has(norm(m.place.name)));

  console.log(`${matched.length}/${places.length} places have a picture in the folder${apply ? "" : " (dry run, nothing written)"}.`);
  if (unmatchedFiles.length) console.log(`\nFiles that match no place (rename them to the exact place name):\n${unmatchedFiles.map((f) => `  ? ${f}`).join("\n")}`);
  if (missing.length) console.log(`\nPlaces still without a picture (they keep their current image):\n${missing.map((p) => `  - ${p.name}`).join("\n")}`);
  if (noSource.length) console.log(`\nPictures without a source line in sources.txt:\n${noSource.map((m) => `  ! ${m.place.name}`).join("\n")}`);
  if (!apply) {
    console.log("\nLooks right? Re-run with --apply.");
    return;
  }

  let done = 0;
  for (const { place, file } of matched) {
    try {
      convert(path.join(folder, file), path.join(ROOT, "public", "places", `${place.id}.jpg`));
      done++;
    } catch (e) {
      console.error(`  ! ${file}: ${e.message}`);
    }
  }
  const creditsPath = path.join(DIR, "photo-credits.md");
  const credits = fs.readFileSync(creditsPath, "utf8");
  const block = creditsBlock(matched.map((m) => ({ name: m.place.name, url: sources.get(norm(m.place.name)) })).sort((a, b) => a.name.localeCompare(b.name)));
  const next = credits.includes(START) ? credits.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block) : credits.replace(/^# Photo credits\n/, `# Photo credits\n\n${block}\n`);
  fs.writeFileSync(creditsPath, next);
  console.log(`\nWrote ${done} photos to public/places/ (896×1200) and the source list to data/photo-credits.md.`);
  console.log("Next: open the app and check the cards (Oscar reviews the look), then commit public/places/ + data/photo-credits.md.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
