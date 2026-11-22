// Demo day: clear ONE person's learned weights (what their swipes taught the feed), so the
// "skip 2 bars → bars gone" moment works again for the next judge. Nothing else is touched:
// swipe history, plans, friends and calendars stay. Saves a copy of the deleted rows first.
//
//   node scripts/demo-reset.mjs            → Anthony (the presenter)
//   node scripts/demo-reset.mjs "Oscar"    → someone else, by the start of their name
//
// Uses .env.local (the real project). Refuses if the name matches 0 or several people.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const who = process.argv[2] ?? "Anthony";
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: users, error } = await db.from("users").select("id, name").ilike("name", `${who}%`);
if (error) throw new Error(error.message);
if (users.length !== 1) {
  console.error(`"${who}" matches ${users.length} people (${users.map((u) => u.name).join(", ") || "none"}). Use a more precise name.`);
  process.exit(1);
}
const me = users[0];
const { data: rows } = await db.from("user_tag_weights").select("*").eq("user_id", me.id);
fs.mkdirSync("qa", { recursive: true });
const backup = `qa/weights-${me.name.split(" ")[0].toLowerCase()}-${Date.now()}.json`;
fs.writeFileSync(backup, JSON.stringify(rows ?? [], null, 1));
const { error: delError, count } = await db.from("user_tag_weights").delete({ count: "exact" }).eq("user_id", me.id);
if (delError) throw new Error(delError.message);
console.log(`${me.name}: cleared ${count} learned weights (copy in ${backup}). Refresh the feed (tap Feed) before the next run.`);
