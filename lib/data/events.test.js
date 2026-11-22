import { describe, expect, it } from "vitest";
import { Place } from "@/types/domain";
import { keepEvent, parseJsonLdTimes } from "./eventRules";
import { eventKeyFrom, eventPlaceIdFor, eventRowToPlace, isEventPlaceId, pickEvents } from "./events";
import { REGISTRY_ID_MIN } from "./registry";

const UUID = "3f2b7c1e-9a4d-4e2b-8c3a-1d2e3f4a5b6c";
// Week of Mon Nov 23 – Sun Nov 29, 2026 (Montréal is UTC−5).
const RANGE = { start: "2026-11-23T05:00:00.000Z", end: "2026-11-30T05:00:00.000Z" };
const row = (over = {}) => ({
  id: UUID, title: "On s’lâche pas! - Hubert Proulx", url: "https://montreal.ca/evenements/slache-pas-hubert-proulx-108339",
  event_type: "Théâtre", audience: "Pour tous", setting: "En salle", is_free: false,
  start_date: "2026-11-27", end_date: "2026-11-27", start_at: "2026-11-28T01:00:00.000Z", end_at: "2026-11-28T03:00:00.000Z", // Fri 20:00–22:00
  venue_name: "L’Entrepôt", address: "2901 Boulevard Saint-Joseph", lat: 45.4327, lng: -73.6743, ...over,
});

describe("ids", () => {
  it("50000000-…-<last 12 hex>, valid uuid, back to the key, above the registry range", () => {
    const id = eventPlaceIdFor(UUID);
    expect(id).toBe("50000000-0000-4000-8000-1d2e3f4a5b6c");
    expect(Place.shape.id.safeParse(id).success).toBe(true);
    expect(isEventPlaceId(id)).toBe(true);
    expect(eventKeyFrom(id)).toBe("1d2e3f4a5b6c");
    expect(eventKeyFrom("40000000-0000-4000-8000-103152678294")).toBeNull();
    expect(id > REGISTRY_ID_MIN).toBe(true);
  });
});

describe("eventRowToPlace: one-off event", () => {
  it("hours only on its weekday, exact window, startsAt, eventUrl, flags, price, photo", () => {
    const p = eventRowToPlace(row(), RANGE);
    const { source, startsAt, eventUrl, ...basics } = p; // event-only fields: in Anthony's contract change
    expect(Place.safeParse(basics).success).toBe(true);
    expect([source, typeof startsAt, typeof eventUrl]).toEqual(["event", "string", "string"]);
    expect(p).toMatchObject({
      id: "50000000-0000-4000-8000-1d2e3f4a5b6c", category: "event", source: "event", hoursVerified: true,
      hours: { fri: [{ open: "20:00", close: "22:00" }] }, typicalDurationMin: 120,
      startsAt: "2026-11-28T01:00:00.000Z", eventUrl: "https://montreal.ca/evenements/slache-pas-hubert-proulx-108339",
      priceLevel: 2, photoUrl: "/fallback/arts.svg", indoor: true, address: "L’Entrepôt, 2901 Boulevard Saint-Joseph",
    });
    expect(Object.keys(p.hours)).toEqual(["fri"]);
    expect(p.tags).toEqual(["art", "theatre"]);
  });

  it("floors the start and ceils the end to :00/:30; free → $ + free tag; music → music photo", () => {
    const p = eventRowToPlace(row({ event_type: "Musique", is_free: true, start_at: "2026-11-24T00:15:00.000Z", end_at: "2026-11-24T02:10:00.000Z" }), RANGE); // Mon 19:15–21:10
    expect(p.hours).toEqual({ mon: [{ open: "19:00", close: "21:30" }] });
    expect(p.typicalDurationMin).toBe(150);
    expect(p).toMatchObject({ priceLevel: 1, photoUrl: "/fallback/music.svg" });
    expect(p.tags).toEqual(expect.arrayContaining(["live-music", "free"]));
  });

  it("after midnight keeps close < open (engine rule); no end → 2 h; outside the range → null", () => {
    expect(eventRowToPlace(row({ start_at: "2026-11-28T04:00:00.000Z", end_at: "2026-11-28T06:00:00.000Z" }), RANGE).hours).toEqual({ fri: [{ open: "23:00", close: "01:00" }] });
    expect(eventRowToPlace(row({ end_at: null }), RANGE).typicalDurationMin).toBe(120);
    expect(eventRowToPlace(row({ start_at: "2026-12-05T01:00:00.000Z", end_at: "2026-12-05T03:00:00.000Z" }), RANGE)).toBeNull();
    expect(eventRowToPlace(row({ start_at: null }), RANGE)).toBeNull(); // no exact time → skip
  });
});

describe("eventRowToPlace: multi-day", () => {
  it("exhibition: every day of the range 11:00–17:00, 60 min, hoursVerified false, no startsAt", () => {
    const p = eventRowToPlace(row({ event_type: "Exposition", start_at: "2025-06-25T17:00:00.000Z", end_at: "2027-06-25T17:00:00.000Z" }), RANGE);
    expect(Object.keys(p.hours).sort()).toEqual(["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);
    expect(p.hours.wed).toEqual([{ open: "11:00", close: "17:00" }]);
    expect(p).toMatchObject({ typicalDurationMin: 60, hoursVerified: false });
    expect(p.startsAt).toBeUndefined();
  });

  it("only the weekdays it actually runs inside the range; a festival keeps its own daily times", () => {
    // Thu Nov 26 10:00 → Sat Nov 28 18:00 local
    const p = eventRowToPlace(row({ event_type: "Fête et marché", start_at: "2026-11-26T15:00:00.000Z", end_at: "2026-11-28T23:00:00.000Z" }), RANGE);
    expect(Object.keys(p.hours).sort()).toEqual(["fri", "sat", "thu"]);
    expect(p.hours.thu).toEqual([{ open: "10:00", close: "18:00" }]);
    expect(p.typicalDurationMin).toBe(120);
  });
});

describe("keepEvent + pickEvents", () => {
  it("keeps outings, drops library/admin types, kids/seniors-only, online, no location", () => {
    expect(keepEvent(row())).toBe(true);
    for (const t of ["Heure du conte", "Conseil et comité", "Soutien et échange", "Informatique", "Cuisine"]) expect(keepEvent(row({ event_type: t }))).toBe(false);
    for (const a of ["Enfants", "Enfants d'âge préscolaire", "Personnes aînées"]) expect(keepEvent(row({ audience: a }))).toBe(false);
    expect(keepEvent(row({ setting: "En ligne" }))).toBe(false);
    expect(keepEvent(row({ lat: null }))).toBe(false);
  });

  it("nearest first, within radius, limit", () => {
    const near = { lat: 45.5048, lng: -73.5772 };
    const rows = [
      row({ id: "00000000-0000-4000-8000-000000000001", lat: 45.52, lng: -73.58 }), // ~1.7 km
      row({ id: "00000000-0000-4000-8000-000000000002", lat: 45.506, lng: -73.578 }), // ~0.15 km
      row({ id: "00000000-0000-4000-8000-000000000003", lat: 45.70, lng: -73.58 }), // ~22 km
      row({ id: "00000000-0000-4000-8000-000000000004", lat: 45.506, lng: -73.578, audience: "Enfants" }),
    ];
    expect(pickEvents(rows, { range: RANGE, near }).map((p) => p.id.slice(-1))).toEqual(["2", "1"]);
    expect(pickEvents(rows, { range: RANGE, near, limit: 1 })).toHaveLength(1);
  });
});

describe("parseJsonLdTimes (montreal.ca pages)", () => {
  const page = (ld) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;
  it("reads startDate/endDate with offsets → UTC", () => {
    expect(parseJsonLdTimes(page({ "@context": "https://schema.org", "@type": "Event", startDate: "2026-11-27T19:30:00-05:00", endDate: "2026-11-27T21:30:00-05:00" })))
      .toEqual({ startAt: "2026-11-28T00:30:00.000Z", endAt: "2026-11-28T02:30:00.000Z" });
  });
  it("handles @graph, missing/invalid end, and pages without an Event", () => {
    expect(parseJsonLdTimes(page({ "@graph": [{ "@type": "WebPage" }, { "@type": "Event", startDate: "2026-11-27T19:30:00-05:00" }] }))).toEqual({ startAt: "2026-11-28T00:30:00.000Z", endAt: null });
    expect(parseJsonLdTimes(page({ "@type": "Event", startDate: "2026-11-27" }))).toBeNull(); // date only: no exact time
    expect(parseJsonLdTimes("<html>no json-ld</html>")).toBeNull();
    expect(parseJsonLdTimes('<script type="application/ld+json">{broken</script>')).toBeNull();
  });
});
