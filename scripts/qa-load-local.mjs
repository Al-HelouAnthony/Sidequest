// QA: load the read-only backup (qa/backup/*.json) into the LOCAL Supabase, so tests run on a copy of the
// real demo world. Refuses to run against anything but localhost.
// Usage: node scripts/qa-load-local.mjs <local env file with API_URL + SERVICE_ROLE_KEY>
import fs from "node:fs";
import path from "node:path";
import { localAdmin } from "./qa-local.mjs";

const db = localAdmin(process.argv[2]);
const ORDER = ["users", "friendships", "places", "busy_blocks", "travel_times", "interactions", "user_tag_weights", "events", "plans", "plan_members", "plan_photos"];
/** Columns Postgres computes itself (can't be inserted). */
const GENERATED = { events: ["place_key"] };
const CONFLICT = {
  friendships: "user_id,friend_id",
  travel_times: "user_id,place_id,mode",
  user_tag_weights: "user_id,tag",
  plan_members: "plan_id,user_id",
};

for (const table of ORDER) {
  const file = path.join("qa", "backup", `${table}.json`);
  let rows = JSON.parse(fs.readFileSync(file, "utf8"));
  const drop = GENERATED[table] ?? [];
  if (drop.length) rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: CONFLICT[table] ?? "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  console.log(table.padEnd(18), rows.length, "→ local", count);
}
