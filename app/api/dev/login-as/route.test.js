// GET /api/dev/login-as (demo mode only): only redirects inside the app.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal()), DEMO_MODE: true }));
const { GET } = await import("./route");
const { NextRequest } = await import("next/server");
const SAM = "00000000-0000-4000-8000-000000000001";
const go = (next) => GET(new NextRequest(`http://localhost:3000/api/dev/login-as?id=${SAM}${next === undefined ? "" : `&next=${encodeURIComponent(next)}`}`));

describe("GET /api/dev/login-as", () => {
  it("sets the demo cookie and goes to the requested in-app page", async () => {
    const res = await go("/plans");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/plans");
    expect(res.headers.get("set-cookie")).toContain(`sq_user=${SAM}`);
    expect((await go(undefined)).headers.get("location")).toBe("http://localhost:3000/feed");
  });

  it("never redirects to another site", async () => {
    for (const evil of ["//evil.com", "/\evil.com", "https://evil.com", "evil.com"]) {
      expect(new URL((await go(evil)).headers.get("location")).host, evil).toBe("localhost:3000");
    }
  });
});
