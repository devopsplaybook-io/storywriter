import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.API_PORT) || 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bash e2e/serve.sh",
    url: `${baseURL}/api/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
