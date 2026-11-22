// Offline feed audit: the real engine on qa/backup data. No server, no database, no env needed.
// Run: npx vitest run -c vitest.audit.config.mjs
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "node", include: ["tests/qa/feed-audit.qa-test.js"], testTimeout: 300_000, env: { USE_MOCK_DATA: "true" } },
});
