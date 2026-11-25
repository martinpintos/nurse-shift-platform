import { validateEnv } from "./env.js";

// A fixed, obviously fake value: long enough for HS256, never a real secret.
const SECRET = "x".repeat(32);

describe("validateEnv", () => {
  it("accepts a Postgres URL and a secret, and applies the defaults", () => {
    expect(
      validateEnv({
        DATABASE_URL: "postgresql://u:p@localhost:5432/db",
        JWT_SECRET: SECRET,
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      PORT: 3001,
      JWT_SECRET: SECRET,
      TRUST_PROXY_HOPS: 1,
    });
  });

  it("coerces PORT and TRUST_PROXY_HOPS from strings", () => {
    const env = validateEnv({
      DATABASE_URL: "postgres://localhost/db",
      JWT_SECRET: SECRET,
      PORT: "4000",
      TRUST_PROXY_HOPS: "0",
    });
    expect(env.PORT).toBe(4000);
    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it("rejects a missing or non-Postgres DATABASE_URL without echoing its value", () => {
    expect(() => validateEnv({ JWT_SECRET: SECRET })).toThrow(/DATABASE_URL/);
    expect(() =>
      validateEnv({
        DATABASE_URL: "mysql://secret@host/db",
        JWT_SECRET: SECRET,
      }),
    ).toThrow(/^(?!.*secret).*DATABASE_URL/);
  });

  it("requires a JWT_SECRET of at least 32 characters, never echoing it", () => {
    const db = "postgres://localhost/db";
    expect(() => validateEnv({ DATABASE_URL: db })).toThrow(/JWT_SECRET/);
    expect(() =>
      validateEnv({ DATABASE_URL: db, JWT_SECRET: "short-but-secret" }),
    ).toThrow(/^(?!.*short-but-secret).*JWT_SECRET/);
  });

  it("rejects a negative or fractional TRUST_PROXY_HOPS", () => {
    for (const hops of ["-1", "1.5", "many"]) {
      expect(() =>
        validateEnv({
          DATABASE_URL: "postgres://localhost/db",
          JWT_SECRET: SECRET,
          TRUST_PROXY_HOPS: hops,
        }),
      ).toThrow(/TRUST_PROXY_HOPS/);
    }
  });
});
