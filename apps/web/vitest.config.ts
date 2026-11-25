import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX as-is for Next.js; tests need it compiled to the React runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
