// QA: remove every QA row from the LOCAL Supabase (assertLocal), plus plans created by tests after the
// backup was loaded, then compare row counts with qa/backup/_summary.json.
// Usage: node scripts/qa-cleanup.mjs [.env.local]
import fs from "node:fs";
import { localAdmin, removeQaData } from "./qa-local.mjs";

const db = localAdmin(process.argv[2] ?? ".env.local");
const backup = JSON.parse(fs.readFileSync("qa/backup/_summary.json", "utf8"));
await removeQaData(db, { since: backup.at });
// Swipes made by tests on the real/demo users, and their learned weights: back to the backup.
const must = (op, { error }) => {
  if (error) throw new Error(`${op}: ${error.message}`);
};
must("interactions", await db.from("interactions").delete().gt("created_at", backup.at));
const weights = JSON.parse(fs.readFileSync("qa/backup/user_tag_weights.json", "utf8"));
must("weights.delete", await db.from("user_tag_weights").delete().neq("tag", "__none__"));
if (weights.length) must("weights.insert", await db.from("user_tag_weights").insert(weights));
const diffs = [];
for (const [table, want] of Object.entries(backup.summary)) {
  if (table.includes(":")) continue;
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  if (count !== want) diffs.push(`${table}: backup ${want}, local ${count}`);
}
console.log(diffs.length ? `Differences (expected for tables the app writes during tests):\n${diffs.join("\n")}` : "Local data matches the backup counts.");
