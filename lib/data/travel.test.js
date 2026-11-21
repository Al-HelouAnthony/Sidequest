import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TravelTime } from "@/types/domain";
import { computeTravelTimes, orsMatrix, WALK_MAX_MIN } from "./travel";

const user = (n, lat = 45.5, lng = -73.57) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, name: `U${n}`, avatarUrl: "", homeLat: lat, homeLng: lng, interests: [] });
const place = (n, lat = 45.51, lng = -73.58) => ({
  id: `10000000-0000-4000-8000-00000000000${n}`, name: `P${n}`, category: "cafe", tags: [], lat, lng, address: "",
  priceLevel: 1, photoUrl: "", hours: {}, typicalDurationMin: 60, indoor: true,
});
const users = [user(1), user(2)];
const places = [place(1), place(2)];

/** fetch stub: answers per profile with the given seconds matrix (or an HTTP status). */
function orsStub(byProfile) {
  return vi.fn(async (url, init) => {
    const profile = url.split("/").pop();
    const answer = byProfile[profile];
    if (typeof answer === "number") return new Response("nope", { status: answer });
    const body = JSON.parse(init.body);
    expect(body.metrics).toEqual(["duration"]);
    expect(init.headers.Authorization).toBe("key");
    return new Response(JSON.stringify({ durations: answer }), { status: 200 });
  });
}

describe("orsMatrix", () => {
  it("sends [lng, lat] locations with users as sources and places as destinations", async () => {
    const fetchImpl = orsStub({ "foot-walking": [[600, 1200], [60, null]] });
    const m = await orsMatrix("foot-walking", users, places, { apiKey: "key", fetchImpl });
    expect(m).toEqual([[10, 20], [1, null]]);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.locations[0]).toEqual([-73.57, 45.5]);
    expect(body.sources).toEqual([0, 1]);
    expect(body.destinations).toEqual([2, 3]);
  });
});

describe("computeTravelTimes", () => {
  it("walks when short, cycles when the walk is long, estimates when unroutable", async () => {
    const fetchImpl = orsStub({
      "foot-walking": [[600, (WALK_MAX_MIN + 10) * 60], [null, 300]],
      "cycling-regular": [[300, 900], [null, 200]],
    });
    const { rows, stats } = await computeTravelTimes(users, places, { apiKey: "key", fetchImpl });
    expect(() => z.array(TravelTime).parse(rows)).not.toThrow();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ minutes: 10, mode: "foot-walking", isEstimate: false });
    expect(rows[1]).toMatchObject({ minutes: 15, mode: "cycling-regular", isEstimate: false });
    expect(rows[2]).toMatchObject({ mode: "foot-walking", isEstimate: true }); // null both ways -> haversine
    expect(rows[3]).toMatchObject({ minutes: 5, mode: "foot-walking", isEstimate: false });
    expect(stats).toEqual({ routed: 3, estimated: 1, errors: [] });
  });

  it("skips the cycling call when every walk is short", async () => {
    const fetchImpl = orsStub({ "foot-walking": [[60, 120], [180, 240]] });
    await computeTravelTimes(users, places, { apiKey: "key", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to estimates for every pair when ORS errors, and reports why", async () => {
    const fetchImpl = orsStub({ "foot-walking": 403 });
    const { rows, stats } = await computeTravelTimes(users, places, { apiKey: "key", fetchImpl });
    expect(rows.every((r) => r.isEstimate)).toBe(true);
    expect(stats.errors[0]).toMatch(/403/);
  });

  it("without an API key: no network, all estimates", async () => {
    const fetchImpl = vi.fn();
    const { rows, stats } = await computeTravelTimes(users, places, { apiKey: "", fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rows).toHaveLength(4);
    expect(stats.estimated).toBe(4);
  });
});
