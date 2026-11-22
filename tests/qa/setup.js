// Loads .env.local (which points at the LOCAL Supabase during the QA run) and refuses anything else.
import { readEnv, assertLocal } from "../../scripts/qa-local.mjs";

const env = readEnv(".env.local");
for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
assertLocal(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
