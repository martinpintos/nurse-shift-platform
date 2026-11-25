import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    // The suite runs through Playwright directly (`pnpm e2e`), not as a turbo task, so
    // turbo's env-var hashing doesn't apply to E2E_BASE_URL or CI here.
    rules: { "turbo/no-undeclared-env-vars": "off" },
  },
  { ignores: ["playwright-report/**", "test-results/**"] },
];
