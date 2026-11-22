import { describe, expect, it } from "vitest";
import { ServerTiming } from "./serverTiming";

describe("ServerTiming", () => {
  it("records each step and a total, in Server-Timing syntax", async () => {
    const t = new ServerTiming();
    expect(await t.measure("load", async () => 42)).toBe(42);
    await t.measure("engine", () => "sync ok");
    expect(t.header()).toMatch(/^load;dur=\d+, engine;dur=\d+, total;dur=\d+$/);
  });

  it("still records a step that throws, and rethrows", async () => {
    const t = new ServerTiming();
    await expect(
      t.measure("captions", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(t.header()).toMatch(/^captions;dur=\d+, total;dur=\d+$/);
  });

  it("sanitizes names to header-safe tokens", async () => {
    const t = new ServerTiming();
    await t.measure("db query", () => 1);
    expect(t.header()).toMatch(/^db_query;dur=/);
  });
});
