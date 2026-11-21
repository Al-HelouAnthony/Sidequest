/** First-time redirect after sign-in + route protection. Fakes only: no Supabase, no Google, no Claude. */
import { describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";
import { afterSignIn } from "./signin";
import { routeDecision } from "./routeGuard";

const NEW_ID = "9a1b2c3d-0000-4000-8000-00000000abcd";
const realUser = (over = {}) => ({ id: NEW_ID, email: "oscar@gmail.com", user_metadata: { full_name: "Oscar M", avatar_url: "https://pic" }, ...over });
const sam = mockUsers[0];

describe("afterSignIn", () => {
  it("brand-new account: ensureUser is called, then → /onboarding (keeps next + calendar status)", async () => {
    const ensureUser = vi.fn().mockResolvedValue({});
    const r = await afterSignIn({ authUser: realUser(), next: "/plans" }, { getUser: async () => null, ensureUser });
    expect(ensureUser).toHaveBeenCalledWith({ id: NEW_ID, name: "Oscar M", avatarUrl: "https://pic" });
    expect(r).toMatchObject({ userId: NEW_ID, isNew: true, calendar: "skipped" });
    expect(r.redirectTo).toBe("/onboarding?next=%2Fplans&calendar=skipped");
  });

  it("row exists but no interests yet → still onboarding", async () => {
    const r = await afterSignIn({ authUser: realUser() }, { getUser: async () => ({ ...sam, id: NEW_ID, interests: [] }) });
    expect(r.isNew).toBe(true);
    expect(r.redirectTo.startsWith("/onboarding")).toBe(true);
  });

  it("returning user (has interests) → straight to next, default /feed", async () => {
    const getUser = async () => ({ ...sam, id: NEW_ID });
    expect((await afterSignIn({ authUser: realUser() }, { getUser })).redirectTo).toBe("/feed");
    expect((await afterSignIn({ authUser: realUser(), next: "/plans/123" }, { getUser })).redirectTo).toBe("/plans/123");
  });

  it("unsafe next is ignored", async () => {
    const r = await afterSignIn({ authUser: realUser(), next: "//evil.com" }, { getUser: async () => ({ ...sam, id: NEW_ID }) });
    expect(r.redirectTo).toBe("/feed");
  });

  it("the demo email maps to Sam: never re-created, Sam has interests → /feed", async () => {
    vi.stubEnv("DEMO_USER_EMAIL", "anthonythehelou@gmail.com");
    const ensureUser = vi.fn();
    const r = await afterSignIn({ authUser: realUser({ email: "AnthonyTheHelou@gmail.com" }) }, { getUser: async (id) => (id === DEMO_USER_ID ? sam : null), ensureUser });
    expect(r.userId).toBe(DEMO_USER_ID);
    expect(ensureUser).not.toHaveBeenCalled();
    expect(r.redirectTo).toBe("/feed");
    vi.unstubAllEnvs();
  });

  it("calendar: synced with the Google token; failure never blocks sign-in; no token → skipped", async () => {
    const getUser = async () => ({ ...sam, id: NEW_ID });
    const ok = vi.fn().mockResolvedValue({ imported: 12 });
    expect(await afterSignIn({ authUser: realUser(), providerToken: "ya29.x" }, { getUser, syncCalendar: ok })).toMatchObject({ calendar: "synced", imported: 12 });
    expect(ok).toHaveBeenCalledWith(NEW_ID, "ya29.x");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = vi.fn().mockRejectedValue(new Error("Google 401"));
    expect(await afterSignIn({ authUser: realUser(), providerToken: "ya29.x" }, { getUser, syncCalendar: boom })).toMatchObject({ calendar: "failed", redirectTo: "/feed" });
    warn.mockRestore();

    const never = vi.fn();
    expect((await afterSignIn({ authUser: realUser(), providerToken: null }, { getUser, syncCalendar: never })).calendar).toBe("skipped");
    expect(never).not.toHaveBeenCalled();
  });

  it("works before Adel's functions exist (no ensureUser / syncCalendar)", async () => {
    const r = await afterSignIn({ authUser: realUser() }, { getUser: async () => null });
    expect(r).toMatchObject({ isNew: true, calendar: "skipped" });
  });

  it("name falls back to the email, then to 'New friend'", async () => {
    const ensureUser = vi.fn();
    await afterSignIn({ authUser: realUser({ user_metadata: {} }) }, { getUser: async () => null, ensureUser });
    expect(ensureUser.mock.calls[0][0].name).toBe("oscar");
    await afterSignIn({ authUser: { id: NEW_ID } }, { getUser: async () => null, ensureUser });
    expect(ensureUser.mock.calls[1][0].name).toBe("New friend");
  });
});

describe("routeDecision (proxy)", () => {
  const real = (pathname, hasSession, search = "") => routeDecision({ pathname, search, hasSession, demoMode: false });

  it("demo mode: everything passes (backup world untouched)", () => {
    for (const p of ["/feed", "/api/feed", "/login", "/plans/1"]) expect(routeDecision({ pathname: p, hasSession: false, demoMode: true })).toEqual({ type: "next" });
  });

  it("real mode, not signed in: pages → /login with next, APIs → 401, login/auth stay public", () => {
    expect(real("/feed", false)).toEqual({ type: "redirect", location: "/login?next=%2Ffeed" });
    expect(real("/plans/42", false, "?x=1")).toEqual({ type: "redirect", location: "/login?next=%2Fplans%2F42%3Fx%3D1" });
    expect(real("/api/feed", false)).toEqual({ type: "unauthorized" });
    expect(real("/login", false)).toEqual({ type: "next" });
    expect(real("/auth/callback", false)).toEqual({ type: "next" });
  });

  it("real mode, signed in: /login forwards to /feed, everything else passes", () => {
    expect(real("/login", true)).toEqual({ type: "redirect", location: "/feed" });
    expect(real("/feed", true)).toEqual({ type: "next" });
    expect(real("/api/plans", true)).toEqual({ type: "next" });
  });
});
