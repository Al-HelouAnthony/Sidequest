/** City events in the engine: a Place with category/source "event" whose hours are the event's own window. */
import { describe, expect, it, vi } from "vitest";
import { FeedCard } from "@/types/feed";
import { toLocal, weekdayKey } from "@/lib/time";
import { makeCtx } from "./fixtures";
import { buildFeed } from "./index";
import { withExtraPlaces } from "./context";

const getEvents = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/data", async (orig) => ({ ...(await orig()), getEvents: (...a) => getEvents(...a) }));
const { loadContext } = await import("./load");

const ctx = makeCtx();
// The event sits exactly on a slot where the first card's group is free, at that card's place.
const ref = buildFeed(ctx).cards[0];
const start = toLocal(ref.slot.start);
const end = toLocal(ref.slot.end);
const hhmm = (/** @type {import("luxon").DateTime} */ dt) => dt.toFormat("HH:mm");
const EVENT_ID = "50000000-0000-4000-8000-00000000abcd";
/** @returns {import("@/types/domain").PlaceT} */
const event = (over = {}) => ({
  id: EVENT_ID,
  name: "Concert test",
  category: "event",
  tags: ["live-music"],
  lat: ref.place.lat,
  lng: ref.place.lng,
  address: "1 Rue Test",
  priceLevel: 2,
  photoUrl: "/fallback/music.svg",
  hours: { [weekdayKey(start)]: [{ open: hhmm(start), close: hhmm(end) }] },
  typicalDurationMin: end.diff(start, "minutes").minutes,
  indoor: true,
  source: "event",
  startsAt: ref.slot.start,
  eventUrl: "https://montreal.ca/evenements/test-1",
  ...over,
});
const eventCards = (c) => buildFeed(c, { filters: { categories: ["event"] } }).cards;

describe("events in the feed", () => {
  it("the card's slot is exactly the event, timing is full, start + page passed through", () => {
    const cards = eventCards(withExtraPlaces(ctx, [event()]));
    expect(cards).toHaveLength(1);
    const [card] = cards;
    FeedCard.parse(card);
    expect(card.slot).toEqual(ref.slot);
    expect(card.breakdown.timing).toBe(1);
    expect(card.place).toMatchObject({ source: "event", startsAt: ref.slot.start, eventUrl: "https://montreal.ca/evenements/test-1" });
    expect(card.friends.length).toBeGreaterThan(0);
  });

  it("nobody goes to an event they're busy for", () => {
    const busy = new Map(ctx.busyByUser);
    busy.set(ctx.me.id, [...(busy.get(ctx.me.id) ?? []), { userId: ctx.me.id, startAt: ref.slot.start, endAt: ref.slot.end, source: "manual" }]);
    expect(eventCards({ ...withExtraPlaces(ctx, [event()]), busyByUser: busy })).toHaveLength(0);
  });

  it("an event running past the end of the day (23:00) is dropped, never shortened", () => {
    const late = event({ hours: { [weekdayKey(start)]: [{ open: "22:00", close: "00:00" }] }, typicalDurationMin: 120 });
    expect(eventCards(withExtraPlaces(ctx, [late]))).toHaveLength(0);
  });

  it("events mix into the normal feed without changing the places' cards", () => {
    const withEvent = buildFeed(withExtraPlaces(ctx, [event()])).cards;
    expect(withEvent.some((c) => c.place.id === EVENT_ID)).toBe(true);
    const placesOnly = withEvent.filter((c) => c.place.id !== EVENT_ID).map((c) => c.place.id);
    expect(new Set(placesOnly)).toEqual(new Set(buildFeed(ctx).cards.map((c) => c.place.id)));
  });
});

describe("loadContext + getEvents", () => {
  it("adds the events near my home, with straight-line travel estimates", async () => {
    getEvents.mockResolvedValueOnce([event()]);
    const { nowLocal } = await import("@/lib/time");
    const loaded = await loadContext("00000000-0000-4000-8000-000000000001", nowLocal());
    expect(getEvents).toHaveBeenCalledWith(expect.objectContaining({ start: expect.any(String) }), { lat: loaded?.me.homeLat, lng: loaded?.me.homeLng });
    expect(loaded?.places.some((p) => p.id === EVENT_ID)).toBe(true);
    expect(loaded?.travel.get(`${loaded.me.id}:${EVENT_ID}`)?.isEstimate).toBe(true);
  });

  it("events failing never breaks the feed", async () => {
    getEvents.mockRejectedValueOnce(new Error("supabase down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { nowLocal } = await import("@/lib/time");
    const loaded = await loadContext("00000000-0000-4000-8000-000000000001", nowLocal());
    expect(loaded?.places.length).toBeGreaterThan(0);
    expect(loaded?.places.some((p) => p.source === "event")).toBe(false);
    warn.mockRestore();
  });
});
