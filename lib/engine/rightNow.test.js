/** "Start a sidequest now": fixture only. */
import { describe, expect, it } from "vitest";
import { makeCtx } from "./fixtures";
import { buildFeed } from "./index";
import { isOpenDuring } from "./candidates";
import { pickRightNow, rightNowWindow } from "./rightNow";

const ctx = makeCtx();
// A window where the feed found a group free: the first card's slot.
const ref = buildFeed(ctx).cards[0];
const startMs = Date.parse(ref.slot.start);
const endMs = Date.parse(ref.slot.end);
const busyDuring = (c, id) => (c.busyByUser.get(id) ?? []).some((b) => Date.parse(b.startAt) < endMs && Date.parse(b.endAt) > startMs);
const blockAll = (c, ids) => {
  const busy = new Map(c.busyByUser);
  for (const id of ids) busy.set(id, [...(busy.get(id) ?? []), { userId: id, startAt: ref.slot.start, endAt: ref.slot.end, source: "manual" }]);
  return { ...c, busyByUser: busy };
};

describe("pickRightNow", () => {
  it("picks an open, reachable place of ours with friends who are really free", () => {
    const pick = pickRightNow(ctx, startMs, endMs);
    expect(pick).not.toBeNull();
    if (!pick) return;
    expect(isOpenDuring(pick.place, ref.slot.start, ref.slot.end)).toBe(true);
    expect(pick.place.source).toBeUndefined(); // curated, never an event / registry place
    expect(pick.friendIds.length).toBeGreaterThan(0);
    for (const id of pick.friendIds) expect(busyDuring(ctx, id)).toBe(false);
  });

  it("prefers the place where the most friends are free", () => {
    const pick = pickRightNow(ctx, startMs, endMs);
    const most = Math.max(...ctx.places.map((p) => pickRightNow({ ...ctx, places: [p] }, startMs, endMs)?.friendIds.length ?? 0));
    expect(pick?.friendIds.length).toBe(most);
  });

  it("my own calendar is ignored (I asked to go now), friends' calendars are not", () => {
    expect(pickRightNow(blockAll(ctx, [ctx.me.id]), startMs, endMs)).toEqual(pickRightNow(ctx, startMs, endMs));
    expect(pickRightNow(blockAll(ctx, ctx.friends.map((f) => f.user.id)), startMs, endMs)).toBeNull();
  });

  it("never at 3 AM (nothing of ours is open)", () => {
    const night = new Date(ref.slot.start);
    night.setUTCHours(8, 0, 0, 0); // 03:00 in Montréal (UTC−5)
    expect(pickRightNow(ctx, night.getTime(), night.getTime() + 3_600_000)).toBeNull();
  });
});

describe("rightNowWindow", () => {
  it("starts 10 min out, rounded up to 5 min, lasts an hour", () => {
    const now = Date.parse("2026-11-21T22:31:20.000Z");
    const { startMs: s, endMs: e } = rightNowWindow(now);
    expect(new Date(s).toISOString()).toBe("2026-11-21T22:45:00.000Z");
    expect(e - s).toBe(3_600_000);
  });
});
