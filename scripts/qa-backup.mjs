// QA: READ-ONLY export of the real Supabase demo data to qa/backup/*.json (gitignored: personal data).
// Only `select` calls. Never exports google_tokens (secrets) or plan_locations (live positions).
// Usage: node scripts/qa-backup.mjs [--env .env.local] [--counts-only]
//   --counts-only: just print row counts + id lists (used at the end to check prod was not touched).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const countsOnly = args.includes("--counts-only");
const env = Object.fromEntries(
  fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(`Missing Supabase URL/key in ${envFile}`);
const db = createClient(url, key, { auth: { persistSession: false } });

/** Exported in full. Order = insert order for the local copy (FKs). */
export const TABLES = [
  ["users", "id"],
  ["friendships", "user_id"],
  ["places", "id"],
  ["busy_blocks", "id"],
  ["travel_times", "user_id"],
  ["interactions", "id"],
  ["user_tag_weights", "user_id"],
  ["events", "id"],
  ["plans", "id"],
  ["plan_members", "plan_id"],
  ["plan_photos", "id"],
];
const COUNT_ONLY = ["businesses"];

async function all(table, order) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").order(order).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const out = path.join("qa", "backup");
fs.mkdirSync(out, { recursive: true });
const summary = {};
for (const [table, order] of TABLES) {
  const rows = await all(table, order);
  summary[table] = rows.length;
  if (!countsOnly) fs.writeFileSync(path.join(out, `${table}.json`), JSON.stringify(rows));
}
for (const table of COUNT_ONLY) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  summary[table] = count;
}
const photos = await db.storage.from("plan-photos").list("", { limit: 1000 });
summary["storage:plan-photos (folders)"] = photos.data?.length ?? `error: ${photos.error?.message}`;
console.log(JSON.stringify({ host: new URL(url).host.split(".")[0].slice(0, 6) + "…", at: new Date().toISOString(), summary }, null, 1));
if (!countsOnly) fs.writeFileSync(path.join(out, "_summary.json"), JSON.stringify({ at: new Date().toISOString(), summary }, null, 1));
