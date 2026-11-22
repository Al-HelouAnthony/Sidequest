import { describe, expect, it } from "vitest";
import { NO_ACCOUNT_MESSAGE, noAccountDecision, routeDecision } from "./routeGuard";

describe("routeDecision (unchanged behaviour)", () => {
  it("demo mode lets everything through", () => {
    expect(routeDecision({ pathname: "/feed", hasSession: false, demoMode: true })).toEqual({ type: "next" });
  });
  it("real mode: no session → /login for pages, 401 for APIs; signed in on /login → /feed", () => {
    expect(routeDecision({ pathname: "/feed", search: "?x=1", hasSession: false, demoMode: false })).toEqual({ type: "redirect", location: "/login?next=%2Ffeed%3Fx%3D1" });
    expect(routeDecision({ pathname: "/api/feed", hasSession: false, demoMode: false })).toEqual({ type: "unauthorized" });
    expect(routeDecision({ pathname: "/login", hasSession: true, demoMode: false })).toEqual({ type: "redirect", location: "/feed" });
  });
});

describe("noAccountDecision (signed in, but no users row)", () => {
  it("pages go to /login with the message and keep where they were going", () => {
    const d = noAccountDecision({ pathname: "/feed", search: "?tab=1" });
    expect(d.type).toBe("redirect");
    const url = new URL(/** @type {any} */ (d).location, "http://x");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/feed?tab=1");
    expect(url.searchParams.get("error")).toBe(NO_ACCOUNT_MESSAGE);
  });

  it("APIs get 401", () => {
    expect(noAccountDecision({ pathname: "/api/me" })).toEqual({ type: "unauthorized" });
  });

  it("never blocks /login or /auth/* (the sign-in callback is what recreates the row)", () => {
    expect(noAccountDecision({ pathname: "/login" })).toEqual({ type: "next" });
    expect(noAccountDecision({ pathname: "/auth/callback", search: "?code=abc" })).toEqual({ type: "next" });
    expect(noAccountDecision({ pathname: "/auth/signout" })).toEqual({ type: "next" });
  });

  it("the PWA manifest is public (the browser fetches it without a session)", () => {
    expect(routeDecision({ pathname: "/manifest.webmanifest", hasSession: false, demoMode: false })).toEqual({ type: "next" });
    expect(routeDecision({ pathname: "/manifest.webmanifest.evil", hasSession: false, demoMode: false }).type).toBe("redirect");
  });
});
