// QA: plans, invites, RSVP, cancel, start-now, photos, memories, live location, booking (HTTP, local DB).
import { describe, expect, it } from "vitest";
import { PlanLocationsResponse, PlanResponse, PlansResponse, MemoriesResponse, PlanPhotosResponse } from "@/types/api";
import { call, db, qaId, QA } from "./helpers";

const U = (n) => qaId(QA.user, n);
const MAX = U(4); // cluster A, empty schedule
const HELENE = U(1); // MWF classes 9–17
const NOINT = U(5); // empty schedule, cluster A
const SEAN = U(2);
const PAT = U(3);
const FULL = U(6);
const ZERO = U(7);
const LOU = U(8); // cluster B: not a friend of MAX
const CAFE = "10000000-0000-4000-8000-000000000001";
const findings = [];
const note = (s) => findings.push(s);

/** A feed card of `as` with ≥ 2 friends (their free time is guaranteed by the feed checks). */
async function cardWithFriends(as) {
  let cursor = null;
  for (let p = 0; p < 5; p++) {
    const r = await call(`/api/feed?seed=3${cursor ? `&cursor=${cursor}` : ""}`, { as });
    const c = r.json.cards.find((x) => x.friends.length >= 2 && x.place.source !== "event");
    if (c) return c;
    cursor = r.json.nextCursor;
  }
  throw new Error("no card with 2 friends");
}
const create = (as, body) => call("/api/plans", { as, method: "POST", body });

describe("plans + invites + RSVP", () => {
  it("create → invitees see it; outsiders get 403; RSVP rules; cancel rules", async () => {
    const card = await cardWithFriends(MAX);
    const invitees = card.friends.slice(0, 2).map((f) => f.id);
    const r = await create(MAX, { placeId: card.place.id, start: card.slot.start, end: card.slot.end, inviteeIds: invitees });
    expect(r.status).toBe(201);
    const plan = PlanResponse.parse(r.json).plan;
    expect(plan.status).toBe("pending");
    expect(plan.members.map((m) => m.userId).sort()).toEqual([MAX, ...invitees].sort());

    // Each invitee sees it in GET /api/plans with rsvp "invited"; a non-member can't open it.
    for (const id of invitees) {
      const list = PlansResponse.parse((await call("/api/plans", { as: id })).json).plans;
      expect(list.find((p) => p.id === plan.id)?.members.find((m) => m.userId === id)?.rsvp).toBe("invited");
    }
    const outsider = invitees.includes(PAT) ? SEAN : PAT;
    const stranger = (await call(`/api/plans/${plan.id}`, { as: ZERO })).status;
    expect(stranger).toBe(403);
    expect((await call(`/api/plans/${plan.id}/rsvp`, { as: ZERO, method: "POST", body: { rsvp: "in" } })).status).toBe(403);
    void outsider;

    // RSVP in → confirmed; change to out → back to pending (if nobody else is in); other invitee in → confirmed.
    const [a, b] = invitees;
    let v = PlanResponse.parse((await call(`/api/plans/${plan.id}/rsvp`, { as: a, method: "POST", body: { rsvp: "in" } })).json).plan;
    expect(v.status).toBe("confirmed");
    v = PlanResponse.parse((await call(`/api/plans/${plan.id}/rsvp`, { as: a, method: "POST", body: { rsvp: "out" } })).json).plan;
    note(`after the only "in" changes to "out": status ${v.status}`);
    v = PlanResponse.parse((await call(`/api/plans/${plan.id}/rsvp`, { as: b, method: "POST", body: { rsvp: "in" } })).json).plan;
    expect(v.status).toBe("confirmed");
    // Bad RSVP values.
    expect((await call(`/api/plans/${plan.id}/rsvp`, { as: b, method: "POST", body: { rsvp: "maybe" } })).status).toBe(400);

    // Booking: members can read it; only the organizer can mark it requested.
    const info = await call(`/api/plans/${plan.id}/booking`, { as: b });
    expect(info.status).toBe(200);
    expect((await call(`/api/plans/${plan.id}/booking`, { as: b, method: "POST" })).status).toBe(403);
    expect((await call(`/api/plans/${plan.id}/booking`, { as: MAX, method: "POST" })).status).toBe(200);

    // Everyone declines (separate plan) → auto-cancelled, final.
    const p2 = await create(MAX, { placeId: card.place.id, start: card.slot.start, end: card.slot.end, inviteeIds: invitees });
    const id2 = p2.json.plan.id;
    await call(`/api/plans/${id2}/rsvp`, { as: a, method: "POST", body: { rsvp: "out" } });
    const last = await call(`/api/plans/${id2}/rsvp`, { as: b, method: "POST", body: { rsvp: "out" } });
    note(`everyone declined → status ${last.json.plan.status}; changing your mind afterwards → ${(await call(`/api/plans/${id2}/rsvp`, { as: b, method: "POST", body: { rsvp: "in" } })).status}`);

    // Cancel: invitee can't; organizer can; RSVP after cancel → 409; cancel twice → still 200.
    expect((await call(`/api/plans/${plan.id}/cancel`, { as: b, method: "POST" })).status).toBe(403);
    expect((await call(`/api/plans/${plan.id}/cancel`, { as: MAX, method: "POST" })).json.plan.status).toBe("cancelled");
    expect((await call(`/api/plans/${plan.id}/cancel`, { as: MAX, method: "POST" })).status).toBe(200);
    expect((await call(`/api/plans/${plan.id}/rsvp`, { as: a, method: "POST", body: { rsvp: "in" } })).status).toBe(409);
    expect((await call(`/api/plans/00000000-0000-4000-8000-00000000dead`, { as: MAX })).status).toBe(404);
  });

  it("edge invites: busy invitee 409, self only, duplicates, non-friend, past plan, bad bodies", async () => {
    const tomorrow10 = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 15 * 3_600_000).toISOString(); // ~10:00 Montréal
    const plus1h = (iso) => new Date(Date.parse(iso) + 3_600_000).toISOString();
    // Busy invitee (fully booked) → 409 with a friendly message.
    const busy = await create(MAX, { placeId: CAFE, start: tomorrow10, end: plus1h(tomorrow10), inviteeIds: [FULL] });
    expect(busy.status).toBe(409);
    note(`busy invitee → ${busy.status} "${busy.json?.error}"`);
    // Only myself.
    const self = await create(MAX, { placeId: CAFE, start: tomorrow10, end: plus1h(tomorrow10), inviteeIds: [MAX] });
    note(`invite only myself → ${self.status}${self.json?.plan ? ` (members: ${self.json.plan.members.length})` : ` "${self.json?.error}"`}`);
    // Duplicates.
    const dup = await create(MAX, { placeId: CAFE, start: tomorrow10, end: plus1h(tomorrow10), inviteeIds: [NOINT, NOINT] });
    expect(dup.status).toBe(201);
    expect(dup.json.plan.members.filter((m) => m.userId === NOINT)).toHaveLength(1);
    // Non-friend.
    const stranger = await create(MAX, { placeId: CAFE, start: tomorrow10, end: plus1h(tomorrow10), inviteeIds: [LOU] });
    note(`invite a non-friend → ${stranger.status}`);
    // In the past.
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const old = await create(MAX, { placeId: CAFE, start: past, end: plus1h(past), inviteeIds: [NOINT] });
    note(`plan 3 days in the past → ${old.status}`);
    // Bad bodies.
    for (const [label, body] of [
      ["end before start", { placeId: CAFE, start: plus1h(tomorrow10), end: tomorrow10, inviteeIds: [NOINT] }],
      ["no invitees", { placeId: CAFE, start: tomorrow10, end: plus1h(tomorrow10), inviteeIds: [] }],
      ["unknown place", { placeId: "10000000-0000-4000-8000-0000000fffff", start: tomorrow10, end: plus1h(tomorrow10), inviteeIds: [NOINT] }],
      ["not a uuid", { placeId: CAFE, start: tomorrow10, end: plus1h(tomorrow10), inviteeIds: ["bob"] }],
    ]) {
      const r = await create(MAX, body);
      expect(r.status, label).toBeGreaterThanOrEqual(400);
      expect(r.status, label).toBeLessThan(500);
    }
    // Clean the plans this test made (they are QA plans anyway, removed by cleanup).
  });

  it("start now: ignores my calendar, needs a free friend; zero friends → 409", async () => {
    const full = await call("/api/plans/now", { as: FULL, method: "POST" });
    note(`start now as fully-booked user (friends free) → ${full.status}`);
    const zero = await call("/api/plans/now", { as: ZERO, method: "POST" });
    expect(zero.status).toBe(409);
    expect(zero.json.error).toMatch(/free/i);
  });

  it("photos, memories, live location: windows, privacy, outsiders", async () => {
    // A plan that started 5 minutes ago (album + location windows open). Invitee: Hélène (free on a Sunday).
    const start = new Date(Date.now() - 5 * 60_000).toISOString();
    const end = new Date(Date.now() + 55 * 60_000).toISOString();
    const r = await create(MAX, { placeId: CAFE, start, end, inviteeIds: [HELENE] });
    expect(r.status).toBe(201);
    const id = r.json.plan.id;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    const upload = async (as, bytes, field = "photo") => {
      const form = new FormData();
      form.append(field, new Blob([bytes], { type: "image/jpeg" }), "m.jpg");
      return call(`/api/plans/${id}/photos`, { as, method: "POST", raw: form });
    };
    expect((await upload(MAX, jpeg)).status).toBe(201);
    expect((await upload(ZERO, jpeg)).status).toBe(403);
    expect((await upload(MAX, new TextEncoder().encode("<svg onload=alert(1)>"))).status).toBe(415);
    expect((await upload(MAX, jpeg, "file")).status).toBe(400);
    const album = PlanPhotosResponse.parse((await call(`/api/plans/${id}/photos`, { as: HELENE })).json).photos;
    expect(album).toHaveLength(1);
    expect(album[0].url).toMatch(/token=/); // signed URL, private bucket
    const mem = MemoriesResponse.parse((await call("/api/memories", { as: HELENE })).json).memories;
    expect(mem.find((m) => m.planId === id)?.photos).toHaveLength(1);
    expect(MemoriesResponse.parse((await call("/api/memories", { as: ZERO })).json).memories).toEqual([]);
    // The signed URL really serves the image; the bucket path without a token doesn't.
    const img = await fetch(album[0].url);
    expect(img.status).toBe(200);
    const publicUrl = album[0].url.replace("/object/sign/", "/object/public/").split("?")[0];
    expect((await fetch(publicUrl)).status).toBeGreaterThanOrEqual(400);

    // Live location: member posts; others see status/ETA, never coordinates; outsider 403; rate limit.
    const loc = await call(`/api/plans/${id}/location`, { as: HELENE, method: "POST", body: { lat: 45.5, lng: -73.57, accuracyM: 20 } });
    expect(loc.status).toBe(200);
    const again = await call(`/api/plans/${id}/location`, { as: HELENE, method: "POST", body: { lat: 45.5, lng: -73.57, accuracyM: 20 } });
    note(`second location post within 15 s → ${again.status}`);
    const seen = await call(`/api/plans/${id}/locations`, { as: MAX });
    expect(seen.status).toBe(200);
    PlanLocationsResponse.parse(seen.json);
    expect(seen.text).not.toMatch(/45\.5|-73\.57|"lat"|"lng"/);
    expect((await call(`/api/plans/${id}/locations`, { as: ZERO })).status).toBe(403);
    expect((await call(`/api/plans/${id}/location`, { as: HELENE, method: "POST", body: { lat: 999, lng: 0, accuracyM: 1 } })).status).toBe(400);
  });

  it("findings", () => {
    console.log(findings.join("\n"));
  });
});
