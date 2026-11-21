/**
 * Which places still need a photo? Owner: Adel.
 *
 *   node data/photo-todo.mjs                      list places still on a placeholder photo
 *   node data/photo-todo.mjs ~/Desktop/photos     also check a folder of photos you collected:
 *                                                 shows which places have a file, which are still missing,
 *                                                 and which files don't match any place name
 *
 * Name your files after the place, e.g. "Café Olimpico.jpg" (accents and capitals don't matter).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const places = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "places.json"), "utf8"));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ORDER = ["cafe", "restaurant", "bar", "park", "viewpoint", "activity", "event"];

// Placeholder = a random picsum photo (old) or a category image from public/fallback/.
const todo = places.filter((p) => p.photoUrl.includes("picsum.photos") || p.photoUrl.startsWith("/fallback/"));
const folderArg = process.argv[2];
let files = [];
if (folderArg) {
  const dir = folderArg.replace(/^~(?=$|\/)/, os.homedir());
  if (!fs.existsSync(dir)) {
    console.error(`Folder not found: ${dir}`);
    process.exit(1);
  }
  files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => ({ file: f, key: norm(f.replace(/\.[^.]+$/, "")) }));
}

const matchedFiles = new Set();
const fileFor = (p) => {
  const hit = files.find((f) => f.key === norm(p.name));
  if (hit) matchedFiles.add(hit.file);
  return hit?.file;
};

console.log(`${places.length - todo.length}/${places.length} places have a real photo. ${todo.length} still on a placeholder:\n`);
let missing = 0;
for (const c of ORDER) {
  const group = todo.filter((p) => p.category === c);
  if (!group.length) continue;
  console.log(c.toUpperCase());
  for (const p of group) {
    const f = folderArg ? fileFor(p) : null;
    if (folderArg && !f) missing++;
    console.log(`  ${folderArg ? (f ? "[x]" : "[ ]") : "-"} ${p.name}  (${p.address})${f ? `  <- ${f}` : ""}`);
  }
  console.log();
}
if (folderArg) {
  const unmatched = files.filter((f) => !matchedFiles.has(f.file));
  console.log(`${todo.length - missing} of ${todo.length} have a file in the folder, ${missing} still missing.`);
  if (unmatched.length) console.log(`\nFiles that don't match any place name (rename them to the exact place name):\n${unmatched.map((f) => `  ? ${f.file}`).join("\n")}`);
}
