/**
 * Add extra places (registry restaurants, N1) to an engine context before buildFeed. Owner: Mhammad.
 * The engine treats a place without a travel row as "can't reach", and registry restaurants have no
 * stored travel times, so we add straight-line estimates for me + friends (isEstimate → "~" on cards),
 * with the same formula Adel uses for missing pairs (lib/data/geo.js). Pure: returns a new context.
 */
import { estimateTravelMin, haversineKm } from "@/lib/data/geo";
import { travelKey } from "@/lib/engine/context";

/**
 * @template {{ places: any[], travel: Map<string, any>, me: any, friends: { user: any }[] }} Ctx
 * @param {Ctx} ctx from loadContext()
 * @param {import("@/types/domain").PlaceT[]} places
 * @returns {Ctx}
 */
export function withExtraPlaces(ctx, places) {
  const known = new Set(ctx.places.map((p) => p.id));
  const fresh = places.filter((p) => !known.has(p.id));
  if (fresh.length === 0) return ctx;
  const people = [ctx.me, ...ctx.friends.map((f) => f.user)];
  const travel = new Map(ctx.travel);
  for (const place of fresh) {
    for (const person of people) {
      travel.set(travelKey(person.id, place.id), {
        userId: person.id,
        placeId: place.id,
        minutes: estimateTravelMin(haversineKm(person.homeLat, person.homeLng, place.lat, place.lng)),
        mode: "foot-walking",
        isEstimate: true,
      });
    }
  }
  return { ...ctx, places: [...ctx.places, ...fresh], travel };
}
