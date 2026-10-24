import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    // e2e/** is Playwright's testDir (run via `playwright test`), not vitest
    exclude: [...defaultExclude, "e2e/**"],
  },
});
