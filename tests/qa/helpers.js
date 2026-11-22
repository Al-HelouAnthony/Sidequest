// Shared helpers for the QA suite: who is calling, ground truth from the local DB, JSON fetch.
import { localAdmin, QA, qaId } from "../../scripts/qa-local.mjs";
import { qaSession } from "../../scripts/qa-session.mjs";

export const BASE = process.env.QA_BASE ?? "http://localhost:3100";
export const db = localAdmin(".env.local");
export const MOCK = {
  sam: "00000000-0000-4000-8000-000000000001",
  maya: "00000000-0000-4000-8000-000000000002",
  karim: "00000000-0000-4000-8000-000000000003",
  antoine: "00000000-0000-4000-8000-000000000004",
  lea: "00000000-0000-4000-8000-000000000005",
};
export { QA, qaId };

/** @type {Map<string, string>} userId → Cookie header */
const cookieCache = new Map();

/**
 * Cookie header that makes the app see `userId`: demo cookie for the 5 mock users, a real local
 * Supabase session for QA users and the real teammates (local auth copies).
 * @param {string} userId
 */
export async function cookieFor(userId) {
  if (cookieCache.has(userId)) return cookieCache.get(userId);
  let header;
  if (Object.values(MOCK).includes(userId)) header = `sq_user=${userId}`;
  else if (userId.startsWith(QA.user)) header = (await qaSession(Number(userId.slice(-2)))).header;
  else header = (await qaSession(`qa_real_${userId.slice(0, 8)}@qa.sidequest.test`)).header;
  cookieCache.set(userId, header);
  return header;
}

/**
 * @param {string} path @param {{ as?: string, method?: string, body?: unknown, headers?: Record<string,string>, raw?: BodyInit }} [opts]
 * @returns {Promise<{ status: number, json: any, ms: number, headers: Headers, text: string }>}
 */
export async function call(path, { as, method = "GET", body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (as) h.cookie = await cookieFor(as);
  if (body !== undefined) h["content-type"] = "application/json";
  const t = performance.now();
  const res = await fetch(BASE + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: "manual" });
  const text = await res.text();
  const ms = performance.now() - t;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, ms, headers: res.headers, text };
}

/** Every row of a table (paged). */
export async function all(table, select = "*") {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
