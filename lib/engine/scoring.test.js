/** Harden pass, Part 7: every score component's direction and bounds. */
import { describe, expect, it } from "vitest";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";
import { ENGINE } from "./config";
import { travelKey } from "./context";
import { makeCtx } from "./fixtures";
import { fairnessScore, friendsScore, interestScore, noveltyScore, proximityScore, weatherScore } from "./scoring";

const [, maya, karim, antoine, lea] = mockUsers; // closeness 3, 3, 2, 1
const ctx = makeCtx();
const place = { id: "20000000-0000-4000-8000-000000000002", category: "cafe", tags: ["coffee", "art"], indoor: false };
const cand = (over = {}) => ({ place, friendIds: [], myMin: 10, weather: { icon: "sun", tempC: 10, rainProb: 0 }, ...over });

describe("interestScore", () => {
  const neutralUser = makeCtx({ me: { ...ctx.me, interests: [] } });

  it("no learned weights + no matching interests → 0.5 (neutral)", () => {
    expect(interestScore({ ...place, tags: ["unknown"] }, neutralUser)).toBeCloseTo(0.5, 6);
  });

  it("matching interests raise it; learned dislike lowers it", () => {
    expect(interestScore(place, makeCtx({ me: { ...ctx.me, interests: ["coffee"] } }))).toBeGreaterThan(0.5);
    expect(interestScore(place, makeCtx({ me: { ...ctx.me, interests: [] }, tagWeights: { "cat:cafe": -0.5 } }))).toBeLessThan(0.2);
  });

  it("a place with no tags still uses the category weight", () => {
    const noTags = { ...place, tags: [] };
    expect(interestScore(noTags, neutralUser)).toBeCloseTo(0.5, 6);
    expect(interestScore(noTags, makeCtx({ tagWeights: { "cat:cafe": 0.5 } }))).toBeGreaterThan(0.5);
  });

  it("always strictly between 0 and 1, even at the extreme weights", () => {
    for (const w of [-1, 1]) {
      const s = interestScore(place, makeCtx({ tagWeights: { coffee: w, art: w, "cat:cafe": w } }));
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(1);
    }
  });
});

describe("friendsScore", () => {
  it("sums closeness, 6 = full, capped at 1", () => {
    expect(friendsScore(cand({ friendIds: [] }), ctx)).toBe(0);
    expect(friendsScore(cand({ friendIds: [lea.id] }), ctx)).toBeCloseTo(1 / 6, 6);
    expect(friendsScore(cand({ friendIds: [maya.id, karim.id] }), ctx)).toBe(1);
    expect(friendsScore(cand({ friendIds: [maya.id, karim.id, antoine.id, lea.id] }), ctx)).toBe(1);
  });

  it("a closer friend scores higher than a less close one", () => {
    expect(friendsScore(cand({ friendIds: [maya.id] }), ctx)).toBeGreaterThan(friendsScore(cand({ friendIds: [lea.id] }), ctx));
  });
});

describe("fairness + proximity", () => {
  const c = makeCtx();
  const setMin = (id, minutes) => c.travel.set(travelKey(id, place.id), { userId: id, placeId: place.id, minutes, mode: "foot-walking", isEstimate: true });

  it("the person travelling longest decides fairness (minimax)", () => {
    setMin(maya.id, 5);
    setMin(karim.id, 30);
    expect(fairnessScore(cand({ friendIds: [maya.id], myMin: 10 }), c)).toBeCloseTo(1 - 10 / ENGINE.maxTravelMin, 6);
    expect(fairnessScore(cand({ friendIds: [maya.id, karim.id], myMin: 10 }), c)).toBeCloseTo(1 - 30 / ENGINE.maxTravelMin, 6);
  });

  it("someone exactly at the cap → fairness 0; never negative", () => {
    setMin(karim.id, ENGINE.maxTravelMin);
    expect(fairnessScore(cand({ friendIds: [karim.id] }), c)).toBe(0);
    setMin(karim.id, 99);
    expect(fairnessScore(cand({ friendIds: [karim.id] }), c)).toBe(0);
  });

  it("proximity: closer is better, 0 at the cap", () => {
    expect(proximityScore(cand({ myMin: 0 }))).toBe(1);
    expect(proximityScore(cand({ myMin: 5 }))).toBeGreaterThan(proximityScore(cand({ myMin: 20 })));
    expect(proximityScore(cand({ myMin: ENGINE.maxTravelMin }))).toBe(0);
  });
});

describe("weatherScore", () => {
  it("indoor: 0.8 normally, 1.0 when it's raining (good rainy-day pick)", () => {
    expect(weatherScore(cand({ place: { ...place, indoor: true } }))).toBe(0.8);
    expect(weatherScore(cand({ place: { ...place, indoor: true }, weather: { icon: "rain", tempC: 5, rainProb: 90 } }))).toBe(1);
  });

  it("outdoor: warmer and drier is better, always within 0–1", () => {
    const w = (tempC, rainProb) => weatherScore(cand({ weather: { icon: "sun", tempC, rainProb } }));
    expect(w(15, 0)).toBeGreaterThan(w(0, 0));
    expect(w(15, 0)).toBeGreaterThan(w(15, 50));
    expect(w(-20, 0)).toBe(0);
    expect(w(40, 0)).toBe(1);
  });
});

describe("noveltyScore", () => {
  const interaction = (action, minutesAgo) => ({
    userId: DEMO_USER_ID,
    placeId: place.id,
    slotStart: "2026-11-21T17:00:00.000Z",
    action,
    createdAt: new Date(Date.parse("2026-11-20T20:00:00.000Z") - minutesAgo * 60_000).toISOString(),
  });

  it("never interacted → 1", () => {
    expect(noveltyScore(cand(), ctx)).toBe(1);
  });

  it("the latest interaction wins (skipped, then saved → saved)", () => {
    const c = makeCtx({ recentInteractions: [interaction("save", 5), interaction("skip", 60)] });
    expect(noveltyScore(cand(), c)).toBe(0.6);
    const c2 = makeCtx({ recentInteractions: [interaction("save", 60), interaction("skip", 5)] });
    expect(noveltyScore(cand(), c2)).toBe(0.2);
  });

  it("other places' interactions don't count", () => {
    const c = makeCtx({ recentInteractions: [{ ...interaction("skip", 5), placeId: "20000000-0000-4000-8000-000000000099" }] });
    expect(noveltyScore(cand(), c)).toBe(1);
  });
});
