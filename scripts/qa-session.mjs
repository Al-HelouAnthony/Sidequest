// QA: a real Supabase session for a QA user (local stack only), as the cookies @supabase/ssr reads.
// No Google: password sign-in on the LOCAL auth server for the qa_ test accounts created by qa-seed.mjs.
// Usage (CLI): node scripts/qa-session.mjs <n> → prints a Cookie header for curl.
// Usage (code): const { cookies, accessToken } = await qaSession(4)
import { createServerClient } from "@supabase/ssr";
import { assertLocal, readEnv, QA_EMAIL_DOMAIN } from "./qa-local.mjs";

/**
 * @param {number | string} who QA user number (1..30) or a full QA email (…@qa.sidequest.test)
 * @param {string} [envFile]
 * @returns {Promise<{ cookies: { name: string, value: string }[], header: string, accessToken: string, userId: string }>}
 */
export async function qaSession(who, envFile = ".env.local") {
  const env = readEnv(envFile);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  assertLocal(url);
  /** @type {Map<string, string>} */
  const jar = new Map();
  const client = createServerClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const email = typeof who === "string" ? who : `qa_user${String(who).padStart(2, "0")}${QA_EMAIL_DOMAIN}`;
  if (!email.endsWith(QA_EMAIL_DOMAIN)) throw new Error("QA sessions only for QA accounts");
  const { data, error } = await client.auth.signInWithPassword({ email, password: "qa-password-123" });
  if (error || !data.session) throw new Error(`sign-in ${email}: ${error?.message}`);
  const cookies = [...jar].map(([name, value]) => ({ name, value }));
  return {
    cookies,
    header: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    accessToken: data.session.access_token,
    userId: data.user.id,
  };
}

if (process.argv[1]?.endsWith("qa-session.mjs")) {
  const s = await qaSession(Number(process.argv[2] ?? 4));
  process.stdout.write(s.header);
}
