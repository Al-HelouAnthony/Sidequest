// QA: capture API responses for every user (QA + teammates' local copies + demo users) to diff before/after a
// change. Volatile fields (signed URL tokens, timestamps of "now") are normalized. Usage:
//   node scripts/qa-snapshot.mjs <label> <path> [<path>…]   → qa/results/snap-<label>.json
import fs from "node:fs";
import { qaSession } from "./qa-session.mjs";
import { localAdmin, QA } from "./qa-local.mjs";

const [label, ...paths] = process.argv.slice(2);
const db = localAdmin(".env.local");
const { data: users } = await db.from("users").select("id").order("id");
const MOCK = new Set(["1", "2", "3", "4", "5"].map((n) => `00000000-0000-4000-8000-00000000000${n}`));
const cookie = async (id) =>
  MOCK.has(id) ? `sq_user=${id}` : (await qaSession(id.startsWith(QA.user) ? Number(id.slice(-2)) : `qa_real_${id.slice(0, 8)}@qa.sidequest.test`)).header;
const norm = (text) => text.replace(/token=[^"&]+/g, "token=X");
const out = {};
for (const u of users) {
  const c = await cookie(u.id);
  for (const p of paths) {
    const r = await fetch(`http://localhost:3100${p}`, { headers: { cookie: c } });
    out[`${u.id} ${p}`] = `${r.status} ${norm(await r.text())}`;
  }
}
fs.writeFileSync(`qa/results/snap-${label}.json`, JSON.stringify(out, null, 1));
console.log(label, Object.keys(out).length, "responses");
