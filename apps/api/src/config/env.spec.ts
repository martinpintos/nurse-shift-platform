import { validateEnv } from "./env.js";

describe("validateEnv", () => {
  it("accepts a Postgres URL and defaults PORT to 3001", () => {
    expect(
      validateEnv({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" }),
    ).toEqual({
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      PORT: 3001,
    });
  });

  it("coerces PORT from a string", () => {
    expect(
      validateEnv({ DATABASE_URL: "postgres://localhost/db", PORT: "4000" })
        .PORT,
    ).toBe(4000);
  });

  it("rejects a missing or non-Postgres DATABASE_URL without echoing its value", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() =>
      validateEnv({ DATABASE_URL: "mysql://secret@host/db" }),
    ).toThrow(/^(?!.*secret).*DATABASE_URL/);
  });
});
