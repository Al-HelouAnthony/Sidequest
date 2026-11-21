import { describe, expect, it } from "vitest";
import { eventToRow, isComplete, rowsToSql } from "./fetch_ticketmaster.mjs";

const tm = (over = {}) => ({
  id: "Z7r9jZ1A7aF0P",
  name: "  Jazz   at the Bell ",
  url: "https://www.ticketmaster.ca/event/x",
  dates: { start: { localDate: "2026-11-27", dateTime: "2026-11-28T01:00:00Z" }, status: { code: "onsale" } },
  classifications: [{ primary: true, segment: { name: "Music" }, genre: { name: "Jazz" } }],
  priceRanges: [{ type: "standard", currency: "CAD", min: 35, max: 89.5 }],
  images: [
    { ratio: "4_3", width: 2000, url: "https://img/4x3.jpg" },
    { ratio: "16_9", width: 640, url: "https://img/small.jpg" },
    { ratio: "16_9", width: 1024, url: "https://img/wide.jpg" },
  ],
  _embedded: { venues: [{ name: "Centre Bell", address: { line1: "1909 Av. des Canadiens-de-Montréal" }, postalCode: "H4B 5G0", location: { latitude: "45.4961", longitude: "-73.5693" } }] },
  ...over,
});

describe("eventToRow", () => {
  it("maps a Ticketmaster event to an events row (widest 16:9 image, cleaned name, numbers)", () => {
    expect(eventToRow(tm())).toMatchObject({
      source: "ticketmaster", source_id: "Z7r9jZ1A7aF0P", title: "Jazz at the Bell", event_type: "Music", genre: "Jazz",
      is_free: false, price_min: 35, price_max: 89.5, currency: "CAD", start_date: "2026-11-27", end_date: "2026-11-27",
      start_at: "2026-11-28T01:00:00Z", venue_name: "Centre Bell", lat: 45.4961, lng: -73.5693, image_url: "https://img/wide.jpg",
    });
  });

  it("no id / name / date → null", () => {
    expect(eventToRow(tm({ id: undefined }))).toBeNull();
    expect(eventToRow(tm({ dates: { start: { localDate: "TBA" } } }))).toBeNull();
  });
});

describe("isComplete (what the feed can use)", () => {
  it("needs an exact start and coordinates", () => {
    expect(isComplete(eventToRow(tm()))).toBe(true);
    expect(isComplete(eventToRow(tm({ dates: { start: { localDate: "2026-11-27" } } })))).toBe(false); // time TBA
    expect(isComplete(eventToRow(tm({ _embedded: { venues: [{ name: "Somewhere" }] } })))).toBe(false);
    expect(isComplete(null)).toBe(false);
  });
});

describe("rowsToSql", () => {
  it("escapes quotes and upserts on (source, source_id)", () => {
    const sql = rowsToSql([eventToRow(tm({ name: "L'Osstidtour" }))]);
    expect(sql).toContain("'L''Osstidtour'");
    expect(sql).toContain("on conflict (source, source_id) do update set");
  });
});
