// QA: put the demo users (Sam + Maya) back to the backed-up state on the LOCAL copy before a demo run:
// learned weights restored from qa/backup, swipes and plans made after the backup removed.
// Usage: node scripts/qa-demo-reset.mjs
import fs from "node:fs";
import { localAdmin } from "./qa-local.mjs";

const db = localAdmin(".env.local");
const DEMO = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const backupAt = JSON.parse(fs.readFileSync("qa/backup/_summary.json", "utf8")).at;
const weights = JSON.parse(fs.readFileSync("qa/backup/user_tag_weights.json", "utf8")).filter((r) => DEMO.includes(r.user_id));
const must = (op, { error }) => {
  if (error) throw new Error(`${op}: ${error.message}`);
};
must("weights.delete", await db.from("user_tag_weights").delete().in("user_id", DEMO));
if (weights.length) must("weights.insert", await db.from("user_tag_weights").insert(weights));
must("interactions.delete", await db.from("interactions").delete().in("user_id", DEMO).gt("created_at", backupAt));
const { data: memberships } = await db.from("plan_members").select("plan_id").in("user_id", DEMO);
const ids = [...new Set((memberships ?? []).map((m) => m.plan_id))];
if (ids.length) must("plans.delete", await db.from("plans").delete().in("id", ids).gt("created_at", backupAt));
console.log(`demo reset: ${weights.length} weights restored, swipes + plans after ${backupAt} removed`);
