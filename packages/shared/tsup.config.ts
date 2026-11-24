import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  // Never wipe dist/ in watch mode: `pnpm dev` starts the API against the dist that
  // `^build` produced, and a clean would delete its .d.ts mid-compile.
  clean: !options.watch,
  target: "es2022",
}));
