/** G3: other good times per card (same place, or another date of the same show). Fixture only. */
import { describe, expect, it } from "vitest";
import { FeedCard } from "@/types/feed";
import { toLocal, weekdayKey } from "@/lib/time";
import { ENGINE } from "./config";
import { makeCtx } from "./fixtures";
import { buildFeed, seriesKey } from "./index";
import { isOpenDuring } from "./candidates";
import { withExtraPlaces } from "./context";

const ctx = makeCtx();
const cards = buildFeed(ctx).cards;
const withAlts = cards.filter((c) => c.alternatives?.length);
const busyDuring = (userId, start, end) =>
  (ctx.busyByUser.get(userId) ?? []).some((b) => Date.parse(b.startAt) < Date.parse(end) && Date.parse(b.endAt) > Date.parse(start));

describe("alternatives", () => {
  it("most cards offer other times, and every card still parses", () => {
    expect(withAlts.length).toBeGreaterThan(cards.length / 2);
    for (const c of cards) FeedCard.parse(c);
  });

  it("every alternative is a real option: open, its friends free the whole time, enough friends", () => {
    for (const c of withAlts) {
      for (const a of c.alternatives ?? []) {
        const place = ctx.places.find((p) => p.id === a.placeId);
        expect(place && isOpenDuring(place, a.slot.start, a.slot.end)).toBe(true);
        expect(a.friends.length).toBeGreaterThanOrEqual(ENGINE.minFriends);
        expect(busyDuring(ctx.me.id, a.slot.start, a.slot.end)).toBe(false);
        for (const f of a.friends) expect(busyDuring(f.id, a.slot.start, a.slot.end)).toBe(false);
      }
    }
  });

  it("never the card's own slot, at most 3, and spread out (another day or ≥ 2 h apart)", () => {
    for (const c of withAlts) {
      const alts = c.alternatives ?? [];
      expect(alts.length).toBeLessThanOrEqual(3);
      const all = [c.slot, ...alts.map((a) => a.slot)];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const sameDay = toLocal(all[i].start).toISODate() === toLocal(all[j].start).toISODate();
          if (sameDay) expect(Math.abs(Date.parse(all[i].start) - Date.parse(all[j].start))).toBeGreaterThanOrEqual(2 * 3_600_000);
        }
      }
    }
  });
});

describe("event series", () => {
  it("another date of the same show (same name + venue, other event row) is offered as an alternative", () => {
    // Two showings of one concert, at the slots of two different free windows from the base feed.
    const [a, b] = [cards[0], cards.find((c) => toLocal(c.slot.start).toISODate() !== toLocal(cards[0].slot.start).toISODate())];
    if (!b) throw new Error("fixture needs two days");
    const showing = (id, ref) => {
      const s = toLocal(ref.slot.start);
      const e = toLocal(ref.slot.end);
      return {
        id, name: "Concert série", category: /** @type {const} */ ("event"), tags: ["live-music"], lat: a.place.lat, lng: a.place.lng,
        address: "1 Rue Test", priceLevel: 1, photoUrl: "/fallback/music.svg",
        hours: { [weekdayKey(s)]: [{ open: s.toFormat("HH:mm"), close: e.toFormat("HH:mm") }] },
        typicalDurationMin: e.diff(s, "minutes").minutes, indoor: true, source: /** @type {const} */ ("event"), startsAt: ref.slot.start,
      };
    };
    const one = showing("50000000-0000-4000-8000-0000000000a1", a);
    const two = showing("50000000-0000-4000-8000-0000000000a2", b);
    expect(seriesKey(one)).toBe(seriesKey(two));

    const evCards = buildFeed(withExtraPlaces(ctx, [one, two]), { filters: { categories: ["event"] } }).cards;
    expect(evCards).toHaveLength(1); // one card for the show…
    const alt = evCards[0].alternatives?.find((x) => x.placeId !== evCards[0].place.id);
    expect(alt).toBeTruthy(); // …offering the other date
    expect(new Set([evCards[0].place.id, alt?.placeId])).toEqual(new Set([one.id, two.id]));
  });
});
