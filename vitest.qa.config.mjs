// QA suite (overnight run): integration tests against the LOCAL Supabase + a running `next start` on :3100.
// Not part of `npm test` (the default config only picks up *.test.js). Run: npx vitest run -c vitest.qa.config.mjs
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/qa/**/*.qa-test.js"],
    setupFiles: ["tests/qa/setup.js"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
