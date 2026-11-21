import { afterEach, describe, expect, it, vi } from "vitest";
import { getClaudeClient } from "./client";

describe("getClaudeClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws a clear error when the API key is missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => getClaudeClient()).toThrow("ANTHROPIC_API_KEY is not set");
  });

  it("returns a client when a key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    expect(getClaudeClient()).toBeDefined();
  });
});
