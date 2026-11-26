import { defaultExclude, defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    globals: false,
    // e2e/** is Playwright's testDir (run via `playwright test`), not vitest
    exclude: [...defaultExclude, "e2e/**"],
    // common-web ships raw .vue/.ts sources that must go through Vite's
    // transform pipeline in tests too.
    server: {
      deps: {
        inline: ["@devopsplaybook.io/common-web"],
      },
    },
  },
});
