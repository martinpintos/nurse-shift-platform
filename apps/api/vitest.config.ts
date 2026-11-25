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
        // e2e tests boot the real app (configureApp) against DATABASE_URL. They share one
        // database and each file resets it, so files run one at a time.
        extends: true,
        test: {
          name: "e2e",
          include: ["test/**/*.e2e-spec.ts"],
          fileParallelism: false,
          // Password hashing is deliberately slow (scrypt), and some tests sign in often.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
