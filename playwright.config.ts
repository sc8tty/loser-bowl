import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const host = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const adminPasswordHash =
  "$2b$10$9dQEkvaejQqgK3M0On1ujO1F5wQKSiJGCBn0R0HXSYE6WewBMKoDG";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run start -- -H ${host} -p ${port}`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      // NODE_ENV=test is required, not cosmetic: Next.js's own env loader
      // (@next/env) skips .env.local specifically when NODE_ENV=test. Without
      // it, `next start` reads the real .env.local from disk and clobbers
      // these test-only values with local-dev ones (e.g. a differently
      // escaped ADMIN_PASSWORD_HASH), breaking bcrypt.compare() at runtime.
      NODE_ENV: "test",
      ADMIN_PASSWORD_HASH: adminPasswordHash,
      ADMIN_SESSION_SECRET: "e2e-admin-session-secret-issue-15",
      DATABASE_URL: "",
      E2E_TEST_MODE: "true",
      LEAGUE_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
