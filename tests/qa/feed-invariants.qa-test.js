// QA: the feed's hard rules, checked card by card for EVERY user (30 QA + 5 demo + 4 teammates' local copies)
// against the database itself (not the engine's own context). Writes qa/results/feed-invariants.json.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { FeedResponse } from "@/types/api";
import { ENGINE, SCORE_WEIGHTS } from "@/lib/engine/config";
import { isOpenDuring } from "@/lib/engine/candidates";
import { toLocal } from "@/lib/time";
import { all, call } from "./helpers";

const PAGES = 4;
const SEED = 12345;

/** DB place row → the fields isOpenDuring needs. */
const asPlace = (r) => ({ ...r, hours: r.hours ?? {} });

describe("feed hard rules for every user", async () => {
  const [users, friendships, busy, places, travel, events] = await Promise.all([
    all("users", "id, name"),
    all("friendships", "user_id, friend_id"),
    all("busy_blocks", "user_id, start_at, end_at"),
    all("places", "id, name, hours, typical_duration_min, indoor, category"),
    all("travel_times", "user_id, place_id, minutes"),
    all("events", "id, title, start_at, end_at, place_key"),
  ]);
  const placeById = new Map(places.map((p) => [p.id, p]));
  const eventByKey = new Map(events.map((e) => [e.place_key, e]));
  const busyBy = new Map();
  for (const b of busy) (busyBy.get(b.user_id) ?? busyBy.set(b.user_id, []).get(b.user_id)).push([Date.parse(b.start_at), Date.parse(b.end_at)]);
  const friendsOf = new Map();
  for (const f of friendships) (friendsOf.get(f.user_id) ?? friendsOf.set(f.user_id, new Set()).get(f.user_id)).add(f.friend_id);
  const travelMins = new Map();
  for (const t of travel) (travelMins.get(`${t.user_id}|${t.place_id}`) ?? travelMins.set(`${t.user_id}|${t.place_id}`, []).get(`${t.user_id}|${t.place_id}`)).push(t.minutes);
  const freeFor = (uid, s, e) => !(busyBy.get(uid) ?? []).some(([bs, be]) => bs < e && be > s);

  const report = { at: new Date().toISOString(), users: {}, violations: [], notes: [] };

  it("every user: 200, valid contract, every card obeys the hard rules", async () => {
    const now = Date.now();
    for (const u of users) {
      const v = (rule, card, detail) => report.violations.push({ user: u.name, rule, card: card?.id, place: card?.place?.name, detail });
      const cards = [];
      let cursor = null;
      let statuses = [];
      let msFirst = 0;
      for (let page = 0; page < PAGES; page++) {
        const qs = new URLSearchParams({ seed: String(SEED) });
        if (cursor) qs.set("cursor", cursor);
        const r = await call(`/api/feed?${qs}`, { as: u.id });
        statuses.push(r.status);
        if (page === 0) msFirst = Math.round(r.ms);
        if (r.status !== 200) {
          v("http-status", null, `${r.status} ${r.text.slice(0, 200)}`);
          break;
        }
        const parsed = FeedResponse.safeParse(r.json);
        if (!parsed.success) {
          v("contract", null, JSON.stringify(parsed.error.issues.slice(0, 3)));
          break;
        }
        cards.push(...parsed.data.cards.map((c) => ({ ...c, page, cursor })));
        cursor = parsed.data.nextCursor;
        if (!cursor) break;
      }
      report.users[u.name] = { id: u.id, statuses, cards: cards.length, firstPageMs: msFirst, sources: {} };

      const ids = new Set();
      const pass1Places = new Set();
      for (const c of cards) {
        const s = Date.parse(c.slot.start);
        const e = Date.parse(c.slot.end);
        const src = c.place.source ?? (placeById.has(c.place.id) ? "curated" : "other");
        report.users[u.name].sources[src] = (report.users[u.name].sources[src] ?? 0) + 1;
        if (ids.has(c.id)) v("duplicate-card-id", c);
        ids.add(c.id);
        const pass = Number((c.cursor ?? "1:0").split(":")[0]) || 1;
        if (pass === 1) {
          if (pass1Places.has(c.place.id)) v("duplicate-place-in-pass-1", c);
          pass1Places.add(c.place.id);
        }
        // Time window: future (lead time), inside the horizon, waking hours.
        if (s < now + (ENGINE.minLeadMin - 1) * 60_000) v("lead-time", c, c.slot.start);
        if (e > now + (ENGINE.horizonDays + 1) * 86_400_000) v("horizon", c, c.slot.end);
        const ls = toLocal(c.slot.start);
        const le = toLocal(c.slot.end);
        const endMin = le.hour * 60 + le.minute + (le.startOf("day") > ls.startOf("day") ? 1440 : 0);
        if (ls.hour * 60 + ls.minute < 9 * 60 || endMin > 23 * 60) v("waking-hours", c, `${ls.toFormat("ccc HH:mm")}–${le.toFormat("HH:mm")}`);
        // Who: me free, every friend free + really my friend, never me, ≥ minFriends, no duplicates.
        if (!freeFor(u.id, s, e)) v("me-busy", c, c.slot.start);
        if (c.friends.length < ENGINE.minFriends) v("min-friends", c);
        const fids = c.friends.map((f) => f.id);
        if (new Set(fids).size !== fids.length) v("duplicate-friend", c);
        for (const f of c.friends) {
          if (f.id === u.id) v("me-in-friends", c);
          if (!friendsOf.get(u.id)?.has(f.id)) v("not-a-friend", c, f.name);
          if (!freeFor(f.id, s, e)) v("friend-busy", c, f.name);
          if (f.travelMin > ENGINE.maxTravelMin) v("friend-travel-cap", c, `${f.name} ${f.travelMin}`);
          const known = travelMins.get(`${f.id}|${c.place.id}`);
          if (known && !known.includes(f.travelMin)) v("friend-travel-mismatch", c, `${f.name} card ${f.travelMin} db ${known}`);
        }
        if (c.myTravelMin > ENGINE.maxTravelMin) v("my-travel-cap", c, c.myTravelMin);
        const mine = travelMins.get(`${u.id}|${c.place.id}`);
        if (mine && !mine.includes(c.myTravelMin)) v("my-travel-mismatch", c, `card ${c.myTravelMin} db ${mine}`);
        // Where: open for the whole visit, long enough, no outdoor place in the rain.
        const row = placeById.get(c.place.id);
        if (row) {
          if (!isOpenDuring(asPlace(row), c.slot.start, c.slot.end)) v("closed", c, `${ls.toFormat("ccc HH:mm")}–${le.toFormat("HH:mm")}`);
          if ((e - s) / 60_000 < row.typical_duration_min) v("too-short", c, `${(e - s) / 60_000} < ${row.typical_duration_min}`);
          if (!row.indoor && c.weather.rainProb > ENGINE.rainCutoff) v("outdoor-in-rain", c, c.weather.rainProb);
        }
        // Events: real event, in the future, its start inside the card's slot.
        if (c.place.source === "event") {
          const ev = eventByKey.get(c.place.id.slice(-12));
          if (!ev) v("event-unknown", c);
          else {
            const evStart = Date.parse(ev.start_at);
            if (evStart < now) v("event-past", c, ev.start_at);
            if (!(evStart >= s - 30 * 60_000 && evStart < e)) v("event-start-outside-slot", c, `${ev.start_at} vs ${c.slot.start}`);
          }
        }
        // Why am I seeing this: total = Σ weight × component.
        const sum = Object.entries(SCORE_WEIGHTS).reduce((acc, [k, w]) => acc + w * c.breakdown[k], 0);
        if (Math.abs(sum - c.score) > 0.002) v("score-mismatch", c, `${c.score} vs Σ ${sum.toFixed(4)}`);
        for (const a of c.alternatives ?? []) {
          const as = Date.parse(a.slot.start);
          const ae = Date.parse(a.slot.end);
          if (a.slot.start === c.slot.start && a.placeId === c.place.id) v("alt-same-slot", c);
          if (!freeFor(u.id, as, ae)) v("alt-me-busy", c, a.slot.start);
          for (const f of a.friends) if (!freeFor(f.id, as, ae)) v("alt-friend-busy", c, `${f.name} ${a.slot.start}`);
          const arow = placeById.get(a.placeId);
          if (arow && !isOpenDuring(asPlace(arow), a.slot.start, a.slot.end)) v("alt-closed", c, a.slot.start);
        }
      }
      // Variety: count 3-in-a-row categories (a soft rule: reported, not a failure).
      let runs = 0;
      for (let i = 2; i < cards.length; i++) if (cards[i].place.category === cards[i - 1].place.category && cards[i].place.category === cards[i - 2].place.category) runs++;
      report.users[u.name].threeInARow = runs;
    }
    fs.mkdirSync("qa/results", { recursive: true });
    fs.writeFileSync("qa/results/feed-invariants.json", JSON.stringify(report, null, 1));
    const byRule = report.violations.reduce((m, x) => ((m[x.rule] = (m[x.rule] ?? 0) + 1), m), {});
    console.log("violations by rule:", byRule);
    expect(report.violations).toEqual([]);
  });
});
