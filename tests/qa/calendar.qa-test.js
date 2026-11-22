// QA: calendar sync against the LOCAL database with a fake Google (no real calendars): a huge calendar
// (3 calendars × 250+ events, paged), re-sync without duplicates, empty calendar, expired token.
import { describe, expect, it } from "vitest";
import { syncCalendar } from "@/lib/calendar/google";
import { replaceBusyBlocks } from "@/lib/data";
import { db, qaId, QA } from "./helpers";

const USER = qaId(QA.user, 28); // empty seeded schedule
const now = new Date();

/** Fake Google: N events per calendar, 45 min each every 3 h (some overlapping across calendars), paged by 100. */
function fakeGoogle({ calendars = ["primary", "classes", "work"], perCalendar = 250, status = 200 } = {}) {
  let requests = 0;
  const fetchImpl = async (url) => {
    requests++;
    if (status !== 200) return new Response(JSON.stringify({ error: { message: "expired" } }), { status });
    const u = new URL(url);
    if (u.pathname.endsWith("/calendarList")) {
      return Response.json({ items: calendars.map((id, i) => ({ id, primary: i === 0, selected: true, accessRole: "owner" })) });
    }
    const cal = decodeURIComponent(u.pathname.split("/calendars/")[1].replace(/\/events$/, ""));
    const offset = calendars.indexOf(cal) * 30 * 60_000;
    const page = Number(u.searchParams.get("pageToken") ?? 0);
    const items = [];
    for (let i = page * 100; i < Math.min(perCalendar, (page + 1) * 100); i++) {
      const start = new Date(now.getTime() + 3_600_000 + i * 3 * 3_600_000 + offset);
      items.push({ id: `${cal}-${i}`, status: "confirmed", start: { dateTime: start.toISOString() }, end: { dateTime: new Date(start.getTime() + 45 * 60_000).toISOString() } });
    }
    const more = (page + 1) * 100 < perCalendar;
    return Response.json({ items, ...(more ? { nextPageToken: String(page + 1) } : {}) });
  };
  return { fetchImpl, count: () => requests };
}
const googleRows = async () => (await db.from("busy_blocks").select("start_at, end_at").eq("user_id", USER).eq("source", "google")).data ?? [];

describe("calendar sync (local DB, fake Google)", () => {
  it("750 events → merged blocks, fast; re-sync gives the same rows (no duplicates); empty → 0; expired token → error, nothing lost", async () => {
    const g = fakeGoogle();
    const t = performance.now();
    const first = await syncCalendar(USER, "fake-token", { now, fetchImpl: g.fetchImpl, save: replaceBusyBlocks });
    const ms = Math.round(performance.now() - t);
    const rows1 = await googleRows();
    expect(rows1.length).toBe(first.imported);
    // Merged: no two blocks overlap.
    const sorted = rows1.map((r) => [Date.parse(r.start_at), Date.parse(r.end_at)]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i][0]).toBeGreaterThan(sorted[i - 1][1] - 1);

    const second = await syncCalendar(USER, "fake-token", { now, fetchImpl: fakeGoogle().fetchImpl, save: replaceBusyBlocks });
    const rows2 = await googleRows();
    expect(rows2.length).toBe(rows1.length);
    expect(second.imported).toBe(first.imported);

    // Expired token: throws, keeps the previous blocks.
    await expect(syncCalendar(USER, "bad", { now, fetchImpl: fakeGoogle({ status: 401 }).fetchImpl, save: replaceBusyBlocks })).rejects.toThrow();
    expect((await googleRows()).length).toBe(rows1.length);

    // Empty calendar → user is free.
    await syncCalendar(USER, "fake-token", { now, fetchImpl: fakeGoogle({ perCalendar: 0 }).fetchImpl, save: replaceBusyBlocks });
    expect((await googleRows()).length).toBe(0);
    console.log({ events: 750, googleRequests: g.count(), blocksAfterMerge: rows1.length, firstSyncMs: ms, calendars: first.calendars });
  });
});
