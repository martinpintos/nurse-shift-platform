import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json. Requires Vite 8.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.spec.ts"] },
      },
      {
        // e2e tests boot the real app (configureApp) and need DATABASE_URL.
        extends: true,
        test: { name: "e2e", include: ["test/**/*.e2e-spec.ts"] },
      },
    ],
  },
});
