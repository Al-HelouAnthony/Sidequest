// QA: PATCH /api/me (onboarding/You), friends add/remove, /api/users search. Clean 4xx, never 500.
import { describe, expect, it } from "vitest";
import { call, db, qaId, QA } from "./helpers";

const U = (n) => qaId(QA.user, n);
const ME = U(30);
const rows = [];

describe("profile + friends", () => {
  it("PATCH /api/me: postal codes, interests, bad input", async () => {
    const cases = [
      ["Plateau postal code", { postalCode: "H2T 1S6" }],
      ["lower-case no space", { postalCode: "h2x1y4" }],
      ["Toronto (outside Montréal)", { postalCode: "M5V 2T6" }],
      ["garbage", { postalCode: "hello" }],
      ["no interests", { interests: [] }],
      ["one interest", { interests: ["coffee"] }],
      ["unknown interest", { interests: ["skydiving"] }],
      ["all interests", { interests: ["coffee", "cheap-eats", "views", "outdoors", "bars", "live-music", "art", "museums", "markets", "brunch", "iconic", "free", "late-night", "cocktails", "nature"] }],
      ["unknown field", { name: "hacked", homeLat: 0 }],
      ["postal too long", { postalCode: "x".repeat(50) }],
    ];
    for (const [label, body] of cases) {
      const r = await call("/api/me", { as: ME, method: "PATCH", body });
      rows.push(`PATCH ${label}: ${r.status}${r.json?.error ? ` "${r.json.error}"` : ""}`);
      // Postal lookups need ROUTING_API_KEY (ORS geocoding). Without it the server answers a clean 503.
      if (r.status === 503 && /isn't set up/.test(r.json?.error ?? "")) continue;
      expect(r.status, label).toBeLessThan(500);
    }
    const { data } = await db.from("users").select("name").eq("id", ME).single();
    expect(data.name).toBe("qa_Filler Five"); // name never changed through PATCH
  });

  it("friends: add / duplicate / self / unknown / remove; users search", async () => {
    const add = (friendId) => call("/api/friends", { as: ME, method: "POST", body: { friendId } });
    for (const [label, id] of [["new friend", U(9)], ["again (duplicate)", U(9)], ["myself", ME], ["unknown id", "0a0a0000-0000-4000-8000-0000000fffff"], ["not a uuid", "bob"]]) {
      const r = await add(id);
      rows.push(`POST /api/friends ${label}: ${r.status}${r.json?.error ? ` "${r.json.error}"` : ""}`);
      expect(r.status, label).toBeLessThan(500);
    }
    const { data: self } = await db.from("friendships").select("*").eq("user_id", ME).eq("friend_id", ME);
    expect(self ?? []).toHaveLength(0);
    const del = await call(`/api/friends/${U(9)}`, { as: ME, method: "DELETE" });
    rows.push(`DELETE friend: ${del.status}`);
    expect(del.status).toBeLessThan(300);
    const del2 = await call(`/api/friends/${U(9)}`, { as: ME, method: "DELETE" });
    rows.push(`DELETE again: ${del2.status}`);
    expect(del2.status).toBeLessThan(500);

    for (const q of ["qa_hel", "@qa", "hélène", "HÉLÈNE", "o'brien", "'; drop table users;--", "%", "_", "a".repeat(31), ""]) {
      const r = await call(`/api/users?q=${encodeURIComponent(q)}`, { as: ME });
      rows.push(`GET /api/users?q=${q.slice(0, 20)}: ${r.status} → ${r.json?.users?.length ?? r.json?.error}`);
      expect(r.status, q).toBeLessThan(500);
      if (r.status === 200) expect(r.text).not.toMatch(/home_?lat|homeLat|email/i);
    }
    console.log(rows.join("\n"));
  });
});
