import { defineConfig, devices } from "@playwright/test";

/**
 * Locally (no E2E_BASE_URL) Playwright starts the built API and web app; `pnpm e2e` builds
 * them first. With E2E_BASE_URL (e.g. the production URL) it tests that deployment as is.
 *
 * Every test resets the demo data through the admin API first, so tests run one at a
 * time against a shared database. The global teardown resets once more, leaving the
 * deployment in the spec's seed state.
 */
const remote = process.env["E2E_BASE_URL"];
const baseURL = remote ?? "http://localhost:3000";
const ci = Boolean(process.env["CI"]);
// Screenshots of every view are a design check, not a test: `pnpm --filter e2e screens`.
const screens = Boolean(process.env["SCREENS"]);

export default defineConfig({
  testDir: "./tests",
  grep: screens ? /@screens/ : undefined,
  grepInvert: screens ? undefined : /@screens/,
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalTeardown: "./global-teardown.ts",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: remote
    ? undefined
    : [
        {
          command: "pnpm --filter api start",
          url: "http://localhost:3001/api/health",
          cwd: "..",
          reuseExistingServer: !ci,
          timeout: 120_000,
        },
        {
          command: "pnpm --filter web start",
          url: "http://localhost:3000/login",
          cwd: "..",
          reuseExistingServer: !ci,
          timeout: 120_000,
        },
      ],
});
