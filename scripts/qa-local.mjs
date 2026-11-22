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
