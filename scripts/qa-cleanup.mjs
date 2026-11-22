// QA: remove every QA row from the LOCAL Supabase (assertLocal), plus plans created by tests after the
// backup was loaded, then compare row counts with qa/backup/_summary.json.
// Usage: node scripts/qa-cleanup.mjs [.env.local]
import fs from "node:fs";
import { localAdmin, removeQaData } from "./qa-local.mjs";

const db = localAdmin(process.argv[2] ?? ".env.local");
const backup = JSON.parse(fs.readFileSync("qa/backup/_summary.json", "utf8"));
await removeQaData(db, { since: backup.at });
const diffs = [];
for (const [table, want] of Object.entries(backup.summary)) {
  if (table.includes(":")) continue;
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  if (count !== want) diffs.push(`${table}: backup ${want}, local ${count}`);
}
console.log(diffs.length ? `Differences (expected for tables the app writes during tests):\n${diffs.join("\n")}` : "Local data matches the backup counts.");
