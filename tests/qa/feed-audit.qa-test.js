// QA audit (no server, no DB): run the REAL engine on the backed-up real data (qa/backup) for the 4 teammates,
// like opening the app 5 times. Measures repetition and distance. Output: qa/results/feed-audit.json
import fs from "node:fs";
import { DateTime } from "luxon";
import { describe, it } from "vitest";
import { buildFeed } from "@/lib/engine";
import { indexContext } from "@/lib/engine/context";
import { rowToBusyBlock, rowToPlace, rowToTravelTime, rowToUser } from "@/lib/data/mappers";
import { pickEvents, defaultEventRange } from "@/lib/data/events";
import { buildMockWeather } from "@/lib/mocks/weather";

const load = (t) => JSON.parse(fs.readFileSync(`qa/backup/${t}.json`, "utf8"));
const runIf = fs.existsSync("qa/backup/users.json");

describe.runIf(runIf)("feed audit on real data", () => {
  it("repetition + distance for each teammate over 5 visits", () => {
    const users = load("users").map(rowToUser);
    const friendships = load("friendships");
    const places = load("places").map(rowToPlace);
    const busy = load("busy_blocks").map(rowToBusyBlock);
    const travel = load("travel_times").map(rowToTravelTime);
    const weights = load("user_tag_weights");
    const now = DateTime.fromISO("2026-11-22T09:30:00", { zone: "America/Toronto" });
    const range = defaultEventRange(now);
    const weather = buildMockWeather();
    const out = {};
    for (const me of users.filter((u) => !u.id.startsWith("00000000"))) {
      const friends = friendships.filter((f) => f.user_id === me.id).map((f) => ({ user: users.find((u) => u.id === f.friend_id), closeness: f.closeness })).filter((f) => f.user);
      const events = pickEvents(load("events"), { range, near: { lat: me.homeLat, lng: me.homeLng } });
      const ctx = indexContext({
        now, me, friends, places: [...places, ...events], busyBlocks: busy, weather, travelTimes: travel,
        tagWeights: Object.fromEntries(weights.filter((w) => w.user_id === me.id).map((w) => [w.tag, w.weight])),
        recentInteractions: [],
      });
      const visits = [];
      for (const seed of [11, 22, 33, 44, 55]) {
        const cards = [];
        for (let pass = 1; pass <= 4 && cards.length < 60; pass++) cards.push(...buildFeed(ctx, { seed, pass }).cards);
        cards.splice(60);
        visits.push(cards);
      }
      const first = visits[0];
      const distinct = (n) => new Set(first.slice(0, n).map((c) => c.place.id)).size;
      const top5 = visits.map((v) => v.slice(0, 5).map((c) => c.place.name));
      const top5Overlap = top5.slice(1).map((t) => t.filter((n) => top5[0].includes(n)).length);
      const my = first.slice(0, 20).map((c) => c.myTravelMin).sort((a, b) => a - b);
      const near15 = places.filter((p) => (travel.find((t) => t.userId === me.id && t.placeId === p.id)?.minutes ?? 99) <= 15).length;
      out[me.name] = {
        friends: friends.map((f) => f.user.name.split(" ")[0]),
        cardsPerVisit: first.length,
        pass1Cards: buildFeed(ctx, { seed: 11, pass: 1 }).cards.length,
        distinctPlacesInFirst20: distinct(20),
        distinctPlacesInFirst60: distinct(60),
        top5Visit1: top5[0],
        top5SharedWithVisit1: top5Overlap,
        myTravelFirst20: { median: my[Math.floor(my.length / 2)], over20min: my.filter((m) => m > 20).length, max: my.at(-1) },
        curatedPlacesWithin15min: near15,
        categoriesFirst20: first.slice(0, 20).reduce((m, c) => ((m[c.place.category] = (m[c.place.category] ?? 0) + 1), m), {}),
      };
    }
    fs.mkdirSync("qa/results", { recursive: true });
    fs.writeFileSync("qa/results/feed-audit.json", JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
  });
});
