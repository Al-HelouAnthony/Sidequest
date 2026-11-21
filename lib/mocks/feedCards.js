/**
 * MOCK DATA. 10 fixed FeedCards in the exact shape /api/feed returns.
 * Oscar builds the feed UI against these; Anthony's engine replaces them.
 * Slots are generated relative to today so they are always in the future.
 */
import { templateCaption } from "@/lib/ai/templates";
import { atLocalTime, nowLocal, toIsoUtc } from "@/lib/time";
import { mockPlaces } from "./places";
import { mockUsers } from "./users";

const [, maya, karim, antoine, lea] = mockUsers;

/** Breakdown in the fixed component order: interest, friends, timing, weather, fairness, novelty, proximity. */
const b = (interest, friends, timing, weather, fairness, novelty, proximity) => ({
  interest, friends, timing, weather, fairness, novelty, proximity,
});

const specs = [
  { placeIdx: 0, dayOffset: 1, start: "14:00", end: "15:00", friends: [{ u: maya, min: 8 }, { u: karim, min: 4 }], myMin: 18, icon: "sun", tempC: 4, rainProb: 5, score: 0.86, breakdown: b(0.9, 0.9, 0.7, 1, 0.8, 0.9, 0.7) },
  { placeIdx: 1, dayOffset: 1, start: "16:00", end: "17:30", friends: [{ u: maya, min: 15 }, { u: antoine, min: 14 }], myMin: 16, icon: "sun", tempC: 3, rainProb: 5, score: 0.81, breakdown: b(0.8, 0.8, 1, 1, 0.9, 1, 0.6) },
  { placeIdx: 5, dayOffset: 1, start: "21:00", end: "23:00", friends: [{ u: karim, min: 9 }], myMin: 14, icon: "cloud", tempC: -1, rainProb: 15, score: 0.74, breakdown: b(0.7, 0.5, 1, 0.8, 0.8, 0.8, 0.7) },
  { placeIdx: 2, dayOffset: 2, start: "12:00", end: "13:00", friends: [{ u: maya, min: 6 }, { u: karim, min: 10 }, { u: antoine, min: 12 }], myMin: 10, icon: "partly", tempC: 2, rainProb: 20, score: 0.79, breakdown: b(0.7, 1, 1, 0.8, 0.9, 0.6, 0.9) },
  { placeIdx: 4, dayOffset: 3, start: "11:00", end: "12:00", friends: [{ u: lea, min: 22 }], myMin: 15, icon: "sun", tempC: 5, rainProb: 5, score: 0.62, breakdown: b(0.6, 0.3, 0.6, 1, 0.6, 1, 0.7) },
  { placeIdx: 7, dayOffset: 2, start: "15:00", end: "17:00", friends: [{ u: antoine, min: 5 }, { u: lea, min: 13 }], myMin: 8, icon: "rain", tempC: 2, rainProb: 80, score: 0.7, breakdown: b(0.8, 0.6, 0.6, 0.9, 0.9, 1, 0.9) },
  { placeIdx: 15, dayOffset: 3, start: "19:00", end: "20:00", friends: [{ u: karim, min: 7 }, { u: maya, min: 5 }], myMin: 14, icon: "cloud", tempC: 0, rainProb: 10, score: 0.77, breakdown: b(0.8, 0.9, 0.9, 0.8, 0.8, 0.5, 0.7) },
  { placeIdx: 13, dayOffset: 4, start: "10:00", end: "11:00", friends: [{ u: maya, min: 12 }], myMin: 6, icon: "sun", tempC: 3, rainProb: 5, score: 0.6, breakdown: b(0.9, 0.4, 0.7, 1, 0.8, 0.6, 1) },
  { placeIdx: 9, dayOffset: 1, start: "20:00", end: "21:30", friends: [{ u: antoine, min: 16 }, { u: maya, min: 14 }], myMin: 13, icon: "cloud", tempC: -2, rainProb: 10, score: 0.66, breakdown: b(0.5, 0.8, 1, 0.8, 0.7, 0.9, 0.7) },
  { placeIdx: 16, dayOffset: 5, start: "13:00", end: "14:30", friends: [{ u: lea, min: 6 }, { u: antoine, min: 11 }], myMin: 20, icon: "sun", tempC: 6, rainProb: 0, score: 0.58, breakdown: b(0.5, 0.5, 0.6, 1, 0.6, 1, 0.5) },
];

/** @returns {import("@/types/feed").FeedCardT[]} */
export function buildMockFeedCards() {
  const today = nowLocal().startOf("day");
  return specs.map((s) => {
    const p = mockPlaces[s.placeIdx];
    const day = today.plus({ days: s.dayOffset });
    const slot = {
      start: toIsoUtc(atLocalTime(day, s.start)),
      end: toIsoUtc(atLocalTime(day, s.end)),
    };
    const friends = s.friends.map(({ u, min }) => ({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      travelMin: min,
      travelIsEstimate: true,
    }));
    const weather = { icon: s.icon, tempC: s.tempC, rainProb: s.rainProb };
    return {
      id: `${p.id}:${slot.start}`,
      place: {
        id: p.id,
        name: p.name,
        category: p.category,
        photoUrl: p.photoUrl,
        priceLevel: p.priceLevel,
        lat: p.lat,
        lng: p.lng,
        address: p.address,
        tags: p.tags,
      },
      slot,
      myTravelMin: s.myMin,
      friends,
      weather,
      score: s.score,
      breakdown: s.breakdown,
      caption: templateCaption({ friends, weather, myTravelMin: s.myMin }),
    };
  });
}
