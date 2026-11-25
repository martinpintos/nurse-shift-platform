import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { EnvSchema } from "../config/env.js";
import { seedDatabase } from "./seed.js";

/**
 * `prisma db seed` (and `pnpm --filter api seed`): inserts the spec's sample data where it
 * is missing. Never resets: demo activity survives a redeploy. Run from the compiled
 * `dist/seed/cli.js`, so it needs `pnpm --filter api build` first.
 */
async function main(): Promise<void> {
  const env = EnvSchema.pick({ DATABASE_URL: true }).safeParse(process.env);
  if (!env.success) {
    // Never echo the value: it holds the database password.
    throw new Error(
      "DATABASE_URL is missing or not a Postgres URL. See apps/api/.env.example.",
    );
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.data.DATABASE_URL }),
  });
  try {
    await seedDatabase(prisma, "ensure");
    console.log("Seed: sample data ensured.");
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
}
