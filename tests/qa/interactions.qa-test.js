// QA: swipes → learning, clamping, validation, forged ids, concurrent swipes.
import { describe, expect, it } from "vitest";
import { LEARNING } from "@/lib/engine/config";
import { call, db, qaId, QA } from "./helpers";

const BOB = qaId(QA.user, 25); // likes bars
const PIA = qaId(QA.user, 19);
const nextHour = () => new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 86_400_000).toISOString();

async function resetWeights(userId) {
  await db.from("user_tag_weights").delete().eq("user_id", userId);
  await db.from("interactions").delete().eq("user_id", userId);
}
async function weights(userId) {
  const { data } = await db.from("user_tag_weights").select("tag, weight").eq("user_id", userId);
  return Object.fromEntries((data ?? []).map((r) => [r.tag, r.weight]));
}
async function firstPage(userId, seed = 5) {
  const r = await call(`/api/feed?seed=${seed}`, { as: userId });
  expect(r.status).toBe(200);
  return r.json.cards;
}
const barPlaceIds = async () => (await db.from("places").select("id").eq("category", "bar")).data.map((p) => p.id);

describe("interactions + learning", () => {
  it("skip 3 bars → bars leave the top 10; save/go raise weights; weights clamp to [min, max]", async () => {
    await resetWeights(BOB);
    const before = await firstPage(BOB);
    const barsBefore = before.filter((c) => c.place.category === "bar");
    expect(barsBefore.length).toBeGreaterThan(0);
    for (const c of barsBefore.slice(0, 3).concat(barsBefore.length < 3 ? before.filter((x) => x.place.category === "bar").slice(0, 3 - barsBefore.length) : [])) {
      const r = await call("/api/interactions", { as: BOB, method: "POST", body: { placeId: c.place.id, slotStart: c.slot.start, action: "skip" } });
      expect(r.status).toBe(200);
    }
    // In case the first page had fewer than 3 bars, skip other bars until 3 skips happened.
    const ids = await barPlaceIds();
    const { count } = await db.from("interactions").select("*", { count: "exact", head: true }).eq("user_id", BOB);
    for (let i = count; i < 3; i++) await call("/api/interactions", { as: BOB, method: "POST", body: { placeId: ids[i], slotStart: nextHour(), action: "skip" } });
    const after = await firstPage(BOB);
    const barsAfter = after.filter((c) => c.place.category === "bar").length;
    console.log({ barsBefore: barsBefore.length, barsAfter, catBar: (await weights(BOB))["cat:bar"] });
    expect(barsAfter).toBe(0);

    // Save + go push a tag up.
    await resetWeights(PIA);
    const cafe = (await db.from("places").select("id, tags").eq("category", "cafe").limit(1)).data[0];
    await call("/api/interactions", { as: PIA, method: "POST", body: { placeId: cafe.id, slotStart: nextHour(), action: "save" } });
    await call("/api/interactions", { as: PIA, method: "POST", body: { placeId: cafe.id, slotStart: nextHour(), action: "go" } });
    const w = await weights(PIA);
    expect(w[`cat:cafe`]).toBeCloseTo(LEARNING.alpha.save + LEARNING.alpha.go, 5); // place tags get the step split across tags (by design)
    expect(w[cafe.tags[0]]).toBeCloseTo((LEARNING.alpha.save + LEARNING.alpha.go) / new Set(cafe.tags).size, 3);

    // Clamp: 12 skips can't go below min.
    for (let i = 0; i < 12; i++) await call("/api/interactions", { as: PIA, method: "POST", body: { placeId: cafe.id, slotStart: nextHour(), action: "skip" } });
    const w2 = await weights(PIA);
    for (const v of Object.values(w2)) expect(v).toBeGreaterThanOrEqual(LEARNING.min);
    expect(w2["cat:cafe"]).toBe(LEARNING.min);
  });

  it("bad input → 4xx with a clean error (never 500 / stack trace); identity never from the body", async () => {
    const cases = [
      { raw: "{not json", note: "malformed JSON" },
      { body: {}, note: "missing fields" },
      { body: { placeId: "nope", slotStart: nextHour(), action: "skip" }, note: "bad uuid" },
      { body: { placeId: "10000000-0000-4000-8000-000000000001", slotStart: "yesterday", action: "skip" }, note: "bad date" },
      { body: { placeId: "10000000-0000-4000-8000-000000000001", slotStart: nextHour(), action: "delete" }, note: "bad enum" },
      { body: { placeId: "10000000-0000-4000-8000-0000000fffff", slotStart: nextHour(), action: "skip" }, note: "unknown place" },
    ];
    const out = [];
    for (const c of cases) {
      const r = await call("/api/interactions", { as: PIA, method: "POST", body: c.body, raw: c.raw, headers: c.raw ? { "content-type": "application/json" } : {} });
      out.push(`${c.note}: ${r.status}`);
      expect(r.status, c.note).toBeGreaterThanOrEqual(400);
      expect(r.status, c.note).toBeLessThan(500);
      expect(r.text).not.toMatch(/at \w+ \(|node_modules|\.js:\d+/);
    }
    console.log(out.join(" · "));

    // Forged userId in the body: the row belongs to the session user.
    await resetWeights(PIA);
    await call("/api/interactions", { as: PIA, method: "POST", body: { placeId: "10000000-0000-4000-8000-000000000001", slotStart: nextHour(), action: "save", userId: BOB } });
    const { data } = await db.from("interactions").select("user_id").eq("place_id", "10000000-0000-4000-8000-000000000001").gte("created_at", new Date(Date.now() - 60_000).toISOString());
    expect(data.every((r) => r.user_id !== BOB || false)).toBe(true);
  });

  it("no session in real-accounts mode → 401 (checked separately); concurrent skips: measure lost updates", async () => {
    await resetWeights(PIA);
    const place = (await db.from("places").select("id, tags").eq("id", "10000000-0000-4000-8000-000000000001").single()).data;
    const N = 4;
    await Promise.all(
      Array.from({ length: N }, () => call("/api/interactions", { as: PIA, method: "POST", body: { placeId: place.id, slotStart: nextHour(), action: "skip" } })),
    );
    const w = await weights(PIA);
    const { count } = await db.from("interactions").select("*", { count: "exact", head: true }).eq("user_id", PIA);
    const expected = Math.max(LEARNING.min, -LEARNING.beta * N);
    console.log({ rows: count, catCafe: w["cat:cafe"], expected });
    expect(count).toBe(N);
    expect(w["cat:cafe"]).toBe(expected); // was -0.25 before the fix (3 of 4 updates lost)
  });
});
