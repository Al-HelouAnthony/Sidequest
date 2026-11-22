// OPTIONAL (QA recommendation, not applied): re-encode public/places/*.jpg at the same size with mozjpeg
// q80 into a SEPARATE folder so the team can compare before replacing anything. QA measured −49 %
// (17.6 MB → 9.0 MB), which helps LCP on phones (3.8 s on a throttled phone, target 2.5 s).
// Usage: node scripts/optimize-place-photos.mjs [outDir=qa/optimized-photos] [quality=80]
// Then look at a few side by side; if happy: copy them over public/places/ (Adel owns these photos).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const out = process.argv[2] ?? "qa/optimized-photos";
const quality = Number(process.argv[3] ?? 80);
fs.mkdirSync(out, { recursive: true });
let before = 0;
let after = 0;
for (const f of fs.readdirSync("public/places").filter((x) => x.endsWith(".jpg"))) {
  const src = fs.readFileSync(path.join("public/places", f));
  const buf = await sharp(src).rotate().jpeg({ quality, mozjpeg: true }).toBuffer();
  fs.writeFileSync(path.join(out, f), buf);
  before += src.length;
  after += buf.length;
}
console.log(`${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB (${Math.round(100 - (100 * after) / before)} % smaller) in ${out}/`);
