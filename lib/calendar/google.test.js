/** Part 14: Google Calendar sync with FAKE Google replies (free: no network, no Claude). */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BusyBlock } from "@/types/domain";
import { GOOGLE_TIMEOUT_MS, SYNC_DAYS, pickCalendarIds, syncCalendar, toBusyBlocks } from "./google";

const USER = "9a1b2c3d-0000-4000-8000-00000000abcd";
const NOW = new Date("2026-11-21T17:00:00.000Z"); // Sat 12:00 Montréal
const RANGE = { start: NOW.toISOString(), end: new Date(NOW.getTime() + SYNC_DAYS * 86_400_000).toISOString() };
const iso = (h, day = 0) => new Date(NOW.getTime() + day * 86_400_000 + h * 3_600_000).toISOString();

/** A fake fetch that answers calendarList + freeBusy like Google does. */
function fakeGoogle({ calendars, freeBusy, status = 200, pages } = {}) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    if (String(url).includes("/calendarList")) {
      if (pages) {
        const token = new URL(url).searchParams.get("pageToken");
        return { ok: true, status: 200, json: async () => (token ? pages[1] : pages[0]) };
      }
      return { ok: true, status: 200, json: async () => ({ items: calendars ?? [{ id: "me@gmail.com", primary: true, selected: true }] }) };
    }
    return { ok: true, status: 200, json: async () => freeBusy ?? { calendars: {} } };
  });
  return { fetchImpl, calls };
}

describe("pickCalendarIds ('all ticked calendars')", () => {
  it("primary + selected, minus hidden/deleted/unticked", () => {
    expect(
      pickCalendarIds([
        { id: "me@gmail.com", primary: true },
        { id: "classes", selected: true },
        { id: "shifts", selected: true, hidden: true },
        { id: "old", selected: true, deleted: true },
        { id: "holidays" },
        { id: "classes", selected: true },
      ]),
    ).toEqual(["me@gmail.com", "classes"]);
  });

  it("nothing qualifies → ['primary']; never more than 50", () => {
    expect(pickCalendarIds([])).toEqual(["primary"]);
    expect(pickCalendarIds(Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, selected: true })))).toHaveLength(50);
  });
});

describe("toBusyBlocks", () => {
  it("merges overlapping + touching busy times across calendars, valid BusyBlocks", () => {
    const reply = {
      calendars: {
        primary: { busy: [{ start: iso(2), end: iso(4) }, { start: iso(9), end: iso(10) }] },
        classes: { busy: [{ start: iso(3), end: iso(5) }, { start: iso(5), end: iso(6) }] },
      },
    };
    const { blocks, skippedCalendars } = toBusyBlocks(USER, reply, RANGE);
    expect(blocks.map((b) => [b.startAt, b.endAt])).toEqual([[iso(2), iso(6)], [iso(9), iso(10)]]);
    expect(blocks.every((b) => b.source === "google" && b.userId === USER)).toBe(true);
    expect(() => z.array(BusyBlock).parse(blocks)).not.toThrow();
    expect(skippedCalendars).toEqual([]);
  });

  it("a calendar with errors is skipped, never guessed", () => {
    const reply = { calendars: { primary: { busy: [{ start: iso(1), end: iso(2) }] }, broken: { errors: [{ domain: "global", reason: "notFound" }] } } };
    const { blocks, skippedCalendars } = toBusyBlocks(USER, reply, RANGE);
    expect(blocks).toHaveLength(1);
    expect(skippedCalendars).toEqual(["broken"]);
  });

  it("clips to the sync window; drops empty / inverted / garbage times", () => {
    const reply = {
      calendars: {
        primary: {
          busy: [
            { start: iso(-5), end: iso(1) },
            { start: iso(0, SYNC_DAYS - 1), end: iso(0, SYNC_DAYS + 2) },
            { start: iso(3), end: iso(3) },
            { start: iso(5), end: iso(4) },
            { start: "not a date", end: iso(6) },
          ],
        },
      },
    };
    const { blocks } = toBusyBlocks(USER, reply, RANGE);
    expect(blocks.map((b) => [b.startAt, b.endAt])).toEqual([[RANGE.start, iso(1)], [iso(0, SYNC_DAYS - 1), RANGE.end]]);
  });

  it("an empty calendar → no blocks (the user is just free)", () => {
    expect(toBusyBlocks(USER, { calendars: { primary: { busy: [] } } }, RANGE).blocks).toEqual([]);
    expect(toBusyBlocks(USER, {}, RANGE).blocks).toEqual([]);
  });
});

describe("syncCalendar", () => {
  it("lists calendars, asks freeBusy for exactly those, saves merged blocks", async () => {
    const { fetchImpl, calls } = fakeGoogle({
      calendars: [{ id: "me@gmail.com", primary: true, selected: true }, { id: "classes", selected: true }, { id: "holidays" }],
      freeBusy: { calendars: { "me@gmail.com": { busy: [{ start: iso(2), end: iso(3) }] }, classes: { busy: [{ start: iso(2.5), end: iso(4) }] } } },
    });
    const save = vi.fn().mockResolvedValue({ imported: 1 });
    const r = await syncCalendar(USER, "ya29.token", { now: NOW, fetchImpl, save });

    expect(r).toEqual({ imported: 1, calendars: 2, skippedCalendars: [] });
    expect(save).toHaveBeenCalledWith(USER, [expect.objectContaining({ startAt: iso(2), endAt: iso(4), source: "google" })], "google");
    const fb = calls.find((c) => c.url.endsWith("/freeBusy"));
    expect(fb.init.method).toBe("POST");
    expect(fb.init.headers.Authorization).toBe("Bearer ya29.token");
    expect(JSON.parse(fb.init.body)).toEqual({ timeMin: RANGE.start, timeMax: RANGE.end, timeZone: "America/Toronto", items: [{ id: "me@gmail.com" }, { id: "classes" }] });
  });

  it("follows calendarList pages", async () => {
    const { fetchImpl } = fakeGoogle({ pages: [{ items: [{ id: "a", primary: true }], nextPageToken: "p2" }, { items: [{ id: "b", selected: true }] }] });
    const r = await syncCalendar(USER, "t", { now: NOW, fetchImpl, save: async () => {} });
    expect(r.calendars).toBe(2);
  });

  it("revoked / expired token (401) → clear error, nothing saved", async () => {
    const save = vi.fn();
    await expect(syncCalendar(USER, "bad", { now: NOW, fetchImpl: fakeGoogle({ status: 401 }).fetchImpl, save })).rejects.toThrow("Google Calendar 401");
    expect(save).not.toHaveBeenCalled();
  });

  it("Google too slow → gives up after the timeout", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn((url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const p = syncCalendar(USER, "t", { now: NOW, fetchImpl: hanging, save: async () => {} });
    const check = expect(p).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(GOOGLE_TIMEOUT_MS + 10);
    await check;
    vi.useRealTimers();
  });

  it("before Adel's replaceBusyBlocks exists → clear error (sign-in marks calendar 'failed')", async () => {
    await expect(syncCalendar(USER, "t", { now: NOW, fetchImpl: fakeGoogle().fetchImpl })).rejects.toThrow("replaceBusyBlocks");
  });
});
