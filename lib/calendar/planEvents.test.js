/** G2: Google Calendar write side. No network: fetch is faked. */
import { describe, expect, it, vi } from "vitest";
import { accessTokenFor, addPlanToCalendar, deletePlanEvent, planEventBody, removePlanFromCalendar } from "./planEvents";

const plan = {
  id: "p1",
  startAt: "2026-11-22T00:30:00.000Z",
  endAt: "2026-11-22T01:30:00.000Z",
  place: { name: "Schwartz's Deli", address: "3895 Boul. Saint-Laurent" },
  members: [
    { name: "Anthony Helou", rsvp: "in" },
    { name: "Maya Chen", rsvp: "in" },
    { name: "Léa", rsvp: "invited" },
  ],
};
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const deps = (fetchImpl, token = "refresh-1") => ({ getRefreshToken: vi.fn(async () => token), fetchImpl, clientId: "cid", clientSecret: "secret" });

describe("planEventBody", () => {
  it("title, place, exact times, who's going, link back to the plan", () => {
    const b = planEventBody(plan);
    expect(b).toMatchObject({ summary: "Sidequest: Schwartz's Deli", location: "3895 Boul. Saint-Laurent", start: { dateTime: plan.startAt }, end: { dateTime: plan.endAt } });
    expect(b.description).toContain("With Anthony, Maya.");
    expect(b.description).toContain("/plans/p1");
  });
});

describe("accessTokenFor", () => {
  it("no refresh token (never connected / demo user) → null, no network", async () => {
    const fetchImpl = vi.fn();
    expect(await accessTokenFor("u", deps(fetchImpl, null))).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes at Google's token endpoint with the server's client id/secret", async () => {
    const fetchImpl = vi.fn(async () => json(200, { access_token: "at-1", expires_in: 3599 }));
    expect(await accessTokenFor("u", deps(fetchImpl))).toBe("at-1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=refresh-1");
  });

  it("revoked / expired token (invalid_grant 400) → null, not an error", async () => {
    expect(await accessTokenFor("u", deps(vi.fn(async () => json(400, { error: "invalid_grant" }))))).toBeNull();
  });
});

describe("add / remove", () => {
  it("add: token then insert on the primary calendar → Google's event id", async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).includes("oauth2") ? json(200, { access_token: "at-1" }) : json(200, { id: "evt-42" })));
    expect(await addPlanToCalendar("u", plan, deps(fetchImpl))).toBe("evt-42");
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(init.headers.Authorization).toBe("Bearer at-1");
    expect(JSON.parse(init.body).summary).toBe("Sidequest: Schwartz's Deli");
  });

  it("add without a connected Google account → null, nothing sent", async () => {
    const fetchImpl = vi.fn();
    expect(await addPlanToCalendar("u", plan, deps(fetchImpl, null))).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("remove: already deleted on Google's side (410) counts as done; other errors throw", async () => {
    await expect(deletePlanEvent("at", "evt", vi.fn(async () => json(410)))).resolves.toBeUndefined();
    await expect(deletePlanEvent("at", "evt", vi.fn(async () => json(500)))).rejects.toThrow("delete 500");
    const fetchImpl = vi.fn(async (url) => (String(url).includes("oauth2") ? json(200, { access_token: "at-1" }) : json(204)));
    await removePlanFromCalendar("u", "evt-42", deps(fetchImpl));
    expect(fetchImpl.mock.calls[1][0]).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-42");
    expect(fetchImpl.mock.calls[1][1].method).toBe("DELETE");
  });
});
