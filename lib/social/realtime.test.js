import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_CHANGED } from "./channels";

// Fake Supabase admin client: records what would be broadcast. No network.
const { fake } = vi.hoisted(() => {
  const fake = {
    sent: [],
    removed: [],
    mode: "ok", // "ok" | "fail" | "throw"
    noConfig: false,
    channel: (topic) => ({
      topic,
      httpSend: async (event, payload) => {
        if (fake.mode === "throw") throw new Error("network down");
        fake.sent.push({ topic, event, payload });
        return fake.mode === "fail" ? { success: false, status: 403, error: "private channels only" } : { success: true };
      },
    }),
    removeChannel: async (channel) => {
      fake.removed.push(channel.topic);
    },
  };
  return { fake };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (fake.noConfig) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return fake;
  },
}));

const { notifyPlanChanged } = await import("./realtime");
const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  fake.sent.length = 0;
  fake.removed.length = 0;
  fake.mode = "ok";
  fake.noConfig = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("notifyPlanChanged", () => {
  it("without Supabase config it skips quietly", async () => {
    fake.noConfig = true;
    await expect(notifyPlanChanged("p1", [SAM])).resolves.toBeUndefined();
    expect(fake.sent).toHaveLength(0);
  });

  it("signals the plan channel and each member once, with no plan data", async () => {
    await notifyPlanChanged("p1", [SAM, MAYA, MAYA]);
    expect(fake.sent.map((s) => s.topic).sort()).toEqual(
      ["plan:p1", `user:${SAM}:invites`, `user:${MAYA}:invites`].sort(),
    );
    for (const s of fake.sent) {
      expect(s.event).toBe(PLAN_CHANGED);
      expect(s.payload).toEqual({ planId: "p1" });
    }
    expect(fake.removed).toHaveLength(3); // every temporary channel is cleaned up
  });

  it("a refused or crashing send never throws", async () => {
    fake.mode = "fail";
    await expect(notifyPlanChanged("p1", [SAM])).resolves.toBeUndefined();
    fake.mode = "throw";
    await expect(notifyPlanChanged("p1", [SAM])).resolves.toBeUndefined();
    expect(fake.removed.length).toBeGreaterThan(0);
  });
});
