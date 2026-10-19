import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running `alchemy dev` server (local D1, R2 and workerd).
 * Start it with `npm run dev`, then `npm run test:e2e`. CI does both.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:1337",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } } : {}),
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
});
