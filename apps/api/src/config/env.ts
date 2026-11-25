import { z } from "zod";

/** Environment the API needs, validated at boot so bad config fails fast. See .env.example. */
export const EnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Signs login tokens (HS256). At least 32 characters, as HS256 needs a 32-byte key. */
  JWT_SECRET: z.string().min(32),
});
export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    // Name the bad keys only: values (connection strings, secrets) must never reach the logs.
    const keys = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid environment: ${keys.join(", ")}. See apps/api/.env.example.`,
    );
  }
  return result.data;
}
