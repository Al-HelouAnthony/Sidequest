/**
 * Service-role client: BYPASSES RLS. Server-only (seed script, trusted server jobs).
 * Never import this from a Client Component; the key would leak.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("createAdminClient() is server-only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
