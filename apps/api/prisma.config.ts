import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `prisma db seed`: the compiled seed (`pnpm --filter api build` first). Idempotent.
    seed: "node dist/seed/cli.js",
  },
  datasource: {
    // Read lazily (no throw when unset) so `prisma generate` works without a database.
    url: process.env["DATABASE_URL"],
  },
});
