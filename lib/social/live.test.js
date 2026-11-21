import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_CHANGED } from "./channels";

// Fake browser Supabase client: one object per channel, records its broadcast handler.
const { fake } = vi.hoisted(() => {
  const fake = { channels: [], removed: 0, noConfig: false };
  fake.createClient = () => {
    if (fake.noConfig) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return {
      channel: (topic) => {
        const ch = {
          topic,
          handler: null,
          filter: null,
          on(type, filter, cb) {
            ch.type = type;
            ch.filter = filter;
            ch.handler = cb;
            return ch;
          },
          subscribe: () => ch,
        };
        fake.channels.push(ch);
        return ch;
      },
      removeChannel: () => {
        fake.removed += 1;
      },
    };
  };
  return { fake };
});
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fake.createClient() }));

const { onPlanSignal } = await import("./live");

beforeEach(() => {
  fake.channels.length = 0;
  fake.removed = 0;
  fake.noConfig = false;
});

describe("onPlanSignal", () => {
  it("two listeners on one topic share one channel, and both get the signal", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = onPlanSignal("user:x:invites", a);
    const stopB = onPlanSignal("user:x:invites", b);
    expect(fake.channels).toHaveLength(1);
    expect(fake.channels[0]).toMatchObject({ type: "broadcast", filter: { event: PLAN_CHANGED } });

    fake.channels[0].handler();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    stopB();
  });

  it("the channel closes only when the last listener leaves", () => {
    const stopA = onPlanSignal("plan:1", () => {});
    const stopB = onPlanSignal("plan:1", () => {});
    stopA();
    expect(fake.removed).toBe(0);
    stopB();
    expect(fake.removed).toBe(1);
    // A later listener opens a fresh channel.
    const stopC = onPlanSignal("plan:1", () => {});
    expect(fake.channels).toHaveLength(2);
    stopC();
  });

  it("without Supabase config it returns a no-op (the hooks keep polling)", () => {
    fake.noConfig = true;
    const stop = onPlanSignal("plan:2", () => {});
    expect(fake.channels).toHaveLength(0);
    expect(() => stop()).not.toThrow();
  });
});
