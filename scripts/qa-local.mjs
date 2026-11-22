// QA helper: an admin Supabase client for the LOCAL stack only (supabase start). Throws for any other host,
// so no QA script can ever write to the real (shared) project.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Parse a KEY=value env file (quotes stripped). @param {string} file */
export function readEnv(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
  );
}

/** @param {string} url */
export function assertLocal(url) {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Refusing to write to ${host}: QA scripts only touch the local Supabase`);
}

/** Id prefixes of QA rows (UUID v4 shape so Zod accepts them). */
export const QA = { user: "0a0a0000-0000-4000-8000-", place: "0b0b0000-0000-4000-8000-", event: "0c0c0000-0000-4000-8000-" };
/** @param {string} prefix @param {number} n */
export const qaId = (prefix, n) => prefix + String(n).padStart(12, "0");
export const QA_EMAIL_DOMAIN = "@qa.sidequest.test";

/**
 * Remove every QA row (idempotent): plans created by QA users or at QA places (members cascade),
 * QA users (their friendships, busy blocks, travel, interactions, weights, members, photos cascade),
 * QA places, QA events, QA auth users. `since` (ISO): also remove plans created after it (made by tests).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ since?: string }} [opts]
 */
export async function removeQaData(db, { since } = {}) {
  const del = async (table, build) => {
    const { error } = await build(db.from(table).delete());
    if (error) throw new Error(`cleanup ${table}: ${error.message}`);
  };
  // uuid columns can't use LIKE directly: filter on the id range instead.
  const range = (q, col, prefix) => q.gte(col, prefix + "000000000000").lte(col, prefix + "ffffffffffff");
  await del("plans", (q) => range(q, "creator_id", QA.user));
  await del("plans", (q) => range(q, "place_id", QA.place));
  if (since) await del("plans", (q) => q.gt("created_at", since));
  await del("users", (q) => range(q, "id", QA.user));
  await del("places", (q) => range(q, "id", QA.place));
  await del("events", (q) => range(q, "id", QA.event));
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`cleanup auth: ${error.message}`);
    const qa = data.users.filter((u) => u.email?.endsWith(QA_EMAIL_DOMAIN));
    for (const u of qa) await db.auth.admin.deleteUser(u.id);
    if (data.users.length < 200) break;
  }
}

/**
 * @param {string} [envFile] `supabase status -o env` output (API_URL, SERVICE_ROLE_KEY) or a .env.local
 *   pointing at the local stack (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 */
export function localAdmin(envFile = ".env.local") {
  const env = readEnv(envFile);
  const url = env.API_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`No Supabase URL/key in ${envFile}`);
  assertLocal(url);
  return createClient(url, key, { auth: { persistSession: false } });
}
