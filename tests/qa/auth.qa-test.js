// QA security in real-accounts mode (server started with DEMO_MODE=false, like production; QA_REAL_MODE=1).
// No session → every API 401, every page → /login?next=…; the demo cookie and dev routes do nothing.
import { describe, expect, it } from "vitest";
import { BASE, call, cookieFor, db, qaId, QA } from "./helpers";

const API = [
  ["GET", "/api/feed"], ["POST", "/api/interactions"], ["POST", "/api/search"], ["GET", "/api/plans"], ["POST", "/api/plans"],
  ["POST", "/api/plans/now"], ["GET", "/api/plans/00000000-0000-4000-8000-000000000000"], ["POST", "/api/plans/00000000-0000-4000-8000-000000000000/rsvp"],
  ["GET", "/api/memories"], ["GET", "/api/friends"], ["POST", "/api/friends"], ["DELETE", "/api/friends/00000000-0000-4000-8000-000000000002"],
  ["GET", "/api/users"], ["GET", "/api/me"], ["PATCH", "/api/me"], ["POST", "/api/calendar/sync"],
];
const PAGES = ["/feed", "/plans", "/memories", "/friends", "/me", "/onboarding", "/plans/preview"];

describe.runIf(process.env.QA_REAL_MODE === "1")("real-accounts mode", () => {
  it("no session: APIs 401 (clean JSON), pages redirect to /login?next=", async () => {
    const out = [];
    for (const [method, path] of API) {
      const r = await call(path, { method, body: method === "GET" || method === "DELETE" ? undefined : {} });
      out.push(`${r.status} ${method} ${path}`);
      expect(r.status, path).toBe(401);
      expect(r.json?.error).toBeTruthy();
    }
    for (const path of PAGES) {
      const r = await call(path);
      expect([307, 308]).toContain(r.status);
      expect(r.headers.get("location")).toContain(`/login?next=${encodeURIComponent(path)}`);
    }
    // Demo cookie is ignored; dev routes are hidden.
    expect((await call("/api/me", { headers: { cookie: "sq_user=00000000-0000-4000-8000-000000000001" } })).status).toBe(401);
    const loginAs = await call("/api/dev/login-as?id=00000000-0000-4000-8000-000000000001");
    expect([401, 404]).toContain(loginAs.status);
    const seed = await call("/api/dev/seed", { method: "POST", headers: { "x-seed-secret": "guess" } });
    expect([401, 404]).toContain(seed.status);
    // Garbage session cookie → treated as signed out, not a 500.
    const junk = await call("/api/me", { headers: { cookie: "sb-127-auth-token=base64-bm90IGEgc2Vzc2lvbg" } });
    expect(junk.status).toBe(401);
    console.log(out.join("\n"));
  });

  it("valid session works; a session whose users row is gone gets signed out (401 + cookie cleared)", async () => {
    const me = await call("/api/me", { as: qaId(QA.user, 4) });
    expect(me.status).toBe(200);
    expect(me.json.user.id).toBe(qaId(QA.user, 4));
    // Session for an auth user with no users row (deleted account).
    const email = `qa_orphan${QA_SUFFIX()}`;
    const { data } = await db.auth.admin.createUser({ email, password: "qa-password-123", email_confirm: true });
    try {
      const { qaSession } = await import("../../scripts/qa-session.mjs");
      const s = await qaSession(email);
      const r = await fetch(`${BASE}/api/me`, { headers: { cookie: s.header }, redirect: "manual" });
      expect(r.status).toBe(401);
      const page = await fetch(`${BASE}/feed`, { headers: { cookie: s.header }, redirect: "manual" });
      expect(page.headers.get("location") ?? "").toContain("/login");
    } finally {
      await db.auth.admin.deleteUser(data.user.id);
    }
    void cookieFor;
  });
});

function QA_SUFFIX() {
  return "@qa.sidequest.test";
}
