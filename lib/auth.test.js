/** Part 13: who is the current user? (pure decision + safe redirects). No network, no Claude. */
import { describe, expect, it } from "vitest";
import { DEMO_USER_ID, mockUsers } from "@/lib/mocks/users";
import { resolveUserId, safeNextPath } from "./auth";

const maya = mockUsers[1].id;
const google = (email, id = "9a1b2c3d-0000-4000-8000-00000000abcd") => ({ id, email });
const DEMO_EMAIL = "anthonythehelou@gmail.com";

describe("resolveUserId", () => {
  it("demo mode, nobody signed in → Sam", () => {
    expect(resolveUserId({ demoMode: true, demoEmail: DEMO_EMAIL })).toBe(DEMO_USER_ID);
  });

  it("'log in as Maya' cookie → Maya (phone 2)", () => {
    expect(resolveUserId({ demoMode: true, demoCookie: maya, demoEmail: DEMO_EMAIL })).toBe(maya);
  });

  it("the demo Google account → Sam (case/space-insensitive)", () => {
    expect(resolveUserId({ demoMode: true, authUser: google(DEMO_EMAIL), demoEmail: DEMO_EMAIL })).toBe(DEMO_USER_ID);
    expect(resolveUserId({ demoMode: true, authUser: google(" AnthonyTheHelou@Gmail.com "), demoEmail: DEMO_EMAIL })).toBe(DEMO_USER_ID);
  });

  it("any other Google account → its own id", () => {
    const other = google("someone@gmail.com");
    expect(resolveUserId({ demoMode: true, authUser: other, demoEmail: DEMO_EMAIL })).toBe(other.id);
  });

  it("a valid demo cookie beats a Google session (explicit choice); an unknown cookie is ignored", () => {
    expect(resolveUserId({ demoMode: true, demoCookie: maya, authUser: google(DEMO_EMAIL), demoEmail: DEMO_EMAIL })).toBe(maya);
    expect(resolveUserId({ demoMode: true, demoCookie: "not-a-user", authUser: google(DEMO_EMAIL), demoEmail: DEMO_EMAIL })).toBe(DEMO_USER_ID);
  });

  it("DEMO_MODE off: cookie ignored, no session → null (not signed in)", () => {
    expect(resolveUserId({ demoMode: false, demoCookie: maya, demoEmail: DEMO_EMAIL })).toBeNull();
    expect(resolveUserId({ demoMode: false, authUser: google(DEMO_EMAIL), demoEmail: DEMO_EMAIL })).toBe(DEMO_USER_ID);
  });

  it("no DEMO_USER_EMAIL configured → Google users keep their own id", () => {
    const u = google(DEMO_EMAIL);
    expect(resolveUserId({ demoMode: true, authUser: u, demoEmail: "" })).toBe(u.id);
  });
});

describe("safeNextPath", () => {
  it("allows in-app paths", () => {
    expect(safeNextPath("/feed")).toBe("/feed");
    expect(safeNextPath("/plans/123?x=1")).toBe("/plans/123?x=1");
  });

  it("blocks anything that could leave the app", () => {
    for (const bad of [null, undefined, "", "feed", "https://evil.com", "//evil.com", "/\\evil.com", 42]) {
      expect(safeNextPath(bad)).toBe("/feed");
    }
  });
});
