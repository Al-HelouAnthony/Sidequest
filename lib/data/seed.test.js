import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import placesJson from "@/data/places.json";
import { refreshPlaces } from "./seed";
import { REGISTRY_ID_MIN } from "./registry";

/** Records every call; each table call chain returns { error: null, data }. */
function fakeDb({ users = [], failOn = null } = {}) {
  const calls = [];
  const db = {
    from(table) {
      const call = { table, op: null, args: [], filters: [] };
      calls.push(call);
      const result = () => (failOn === table ? { error: { message: "boom", code: "XX000" }, data: null } : { error: null, data: table === "users" ? users : call.op === "delete" ? [{ id: "x" }] : null });
      const chain = {
        upsert: (rows, opts) => ((call.op = "upsert"), (call.args = [rows, opts]), Promise.resolve(result())),
        insert: (rows) => ((call.op = "insert"), (call.args = [rows]), Promise.resolve(result())),
        select: (cols) => {
          if (call.op === "delete") return Promise.resolve(result()); // delete().…select("id")
          call.op = "select";
          call.args = [cols];
          return Promise.resolve(result());
        },
        delete: () => ((call.op = "delete"), chain),
        lt: (...a) => (call.filters.push(["lt", ...a]), chain),
        not: (...a) => (call.filters.push(["not", ...a]), chain),
        in: (...a) => (call.filters.push(["in", ...a]), Promise.resolve(result())),
      };
      return chain;
    },
  };
  return { db, calls };
}

const user = { id: "00000000-0000-4000-8000-000000000001", name: "Sam", avatar_url: "", home_lat: 45.5, home_lng: -73.57, interests: [] };
const computeTravel = vi.fn(async (users, places) => ({
  rows: users.flatMap((u) => places.map((p) => ({ userId: u.id, placeId: p.id, minutes: 12, mode: "foot-walking", isEstimate: false }))),
  stats: { routed: users.length * places.length, estimated: 0, errors: [] },
}));

describe("refreshPlaces", () => {
  it("upserts every curated place, recomputes travel, and never touches plans, swipes, weights, friends or busy blocks", async () => {
    const { db, calls } = fakeDb({ users: [user] });
    const res = await refreshPlaces(/** @type {any} */ (db), { computeTravel });

    expect(res).toMatchObject({ places: placesJson.length, users: 1, travelTimes: placesJson.length, travelRouted: placesJson.length, travelEstimated: 0, warnings: [] });
    const tables = new Set(calls.map((c) => c.table));
    expect([...tables].sort()).toEqual(["places", "travel_times", "users"]);
    for (const forbidden of ["plans", "plan_members", "interactions", "user_tag_weights", "friendships", "busy_blocks"]) expect(tables.has(forbidden)).toBe(false);

    const upsert = calls.find((c) => c.table === "places" && c.op === "upsert");
    expect(upsert.args[0]).toHaveLength(placesJson.length);
    expect(upsert.args[1]).toEqual({ onConflict: "id" });
    // Photos are the bundled images (public/places/<id>.jpg), never picsum or a Google lookup.
    const banquise = upsert.args[0].find((r) => r.name === "La Banquise");
    expect(banquise.photo_url).toBe(`/places/${banquise.id}.jpg`);
    for (const row of upsert.args[0]) {
      expect(row.photo_url).toMatch(/^\/places\/[0-9a-f-]{36}\.jpg$/);
      expect(existsSync(`public${row.photo_url}`), row.name).toBe(true);
      expect(row).not.toHaveProperty("google_place_id");
    }
  });

  it("stale-place delete only reaches curated ids (below the registry range), so saved registry restaurants and their plans survive", async () => {
    const { db, calls } = fakeDb({ users: [user] });
    await refreshPlaces(/** @type {any} */ (db), { computeTravel });
    const del = calls.find((c) => c.table === "places" && c.op === "delete");
    expect(del.filters[0]).toEqual(["lt", "id", REGISTRY_ID_MIN]);
    expect(del.filters[1][0]).toBe("not");
    expect(del.filters[1][2]).not.toContain("20000000-");
  });

  it("travel rows are replaced only for the curated places", async () => {
    const { db, calls } = fakeDb({ users: [user] });
    await refreshPlaces(/** @type {any} */ (db), { computeTravel });
    const del = calls.find((c) => c.table === "travel_times" && c.op === "delete");
    expect(del.filters[0][0]).toBe("in");
    expect(del.filters[0][1]).toBe("place_id");
    expect(del.filters[0][2]).toHaveLength(placesJson.length);
    expect(calls.find((c) => c.table === "travel_times" && c.op === "insert").args[0]).toHaveLength(placesJson.length);
  });

  it("a database error stops it loudly with the step name", async () => {
    const { db } = fakeDb({ users: [user], failOn: "places" });
    await expect(refreshPlaces(/** @type {any} */ (db), { computeTravel })).rejects.toThrow(/places\.upsert failed \(XX000\): boom/);
  });
});
