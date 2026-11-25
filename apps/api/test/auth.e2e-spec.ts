import {
  ERROR_MESSAGES,
  LoginResponseSchema,
  MeResponseSchema,
} from "@repo/shared";
import { LOGIN_THROTTLE } from "../src/auth/login-throttle.js";
import { JWT_AUDIENCE, JWT_ISSUER } from "../src/auth/jwt-auth.provider.js";
import { SEED_PASSWORD } from "../src/seed/seed-data.js";
import {
  bearer,
  createTestApp,
  emailOf,
  errorOf,
  login,
  resetDatabase,
  type TestApp,
} from "./helpers.js";

function claimsOf(token: string): Record<string, unknown> {
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
    string,
    unknown
  >;
}

describe("auth (e2e)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t);
  });

  afterAll(async () => {
    await t.close();
  });

  describe("POST /api/auth/login", () => {
    it("signs Maria Lopez in with the spec's response shape", async () => {
      const response = await t
        .http()
        .post("/api/auth/login")
        .send({ email: "maria.lopez@example.com", password: "Trial2026!" })
        .expect(200);
      const body = LoginResponseSchema.parse(response.body);
      expect(body.user).toEqual({
        id: "nurse-1",
        name: "Maria Lopez",
        role: "nurse",
      });
    });

    it.each([
      ["nurse-2", { id: "nurse-2", name: "James Cook", role: "nurse" }],
      ["admin-1", { id: "admin-1", name: "Alex Kim", role: "admin" }],
      [
        "agency-a",
        { id: "agency-a", name: "Sunrise Health Staffing", role: "agency" },
      ],
      [
        "agency-b",
        { id: "agency-b", name: "Metro Care Partners", role: "agency" },
      ],
    ] as const)("signs %s in with the same shape", async (id, user) => {
      const response = await t
        .http()
        .post("/api/auth/login")
        .send({ email: emailOf(id), password: SEED_PASSWORD })
        .expect(200);
      expect(LoginResponseSchema.parse(response.body).user).toEqual(user);
    });

    it("issues an HS256 token for shiftpatch-web that lives 8 hours", async () => {
      const token = await login(t, "agency-a");
      const header = JSON.parse(
        Buffer.from(token.split(".")[0] ?? "", "base64url").toString(),
      ) as Record<string, unknown>;
      expect(header["alg"]).toBe("HS256");
      const claims = claimsOf(token);
      expect(claims).toMatchObject({
        sub: "agency-a",
        role: "agency",
        agencyId: "agency-a",
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
      });
      expect(Number(claims["exp"]) - Number(claims["iat"])).toBe(8 * 60 * 60);
      expect(claimsOf(await login(t, "nurse-1"))).toMatchObject({
        sub: "nurse-1",
        role: "nurse",
        agencyId: null,
      });
    });

    it("matches the email case-insensitively and ignores surrounding spaces", async () => {
      const response = await t
        .http()
        .post("/api/auth/login")
        .send({ email: "  Maria.Lopez@EXAMPLE.com ", password: SEED_PASSWORD })
        .expect(200);
      expect(LoginResponseSchema.parse(response.body).user.id).toBe("nurse-1");
    });

    it.each([
      [
        "a wrong password",
        { email: "maria.lopez@example.com", password: "wrong" },
      ],
      [
        "an unknown email",
        { email: "nobody@example.com", password: SEED_PASSWORD },
      ],
      [
        "a password in the wrong case",
        { email: "alex.kim@example.com", password: "trial2026!" },
      ],
      ["a wildcard email", { email: "%", password: SEED_PASSWORD }],
    ])("answers 401 Invalid email or password for %s", async (_, body) => {
      const response = await t
        .http()
        .post("/api/auth/login")
        .set("X-Forwarded-For", "198.51.100.1")
        .send(body)
        .expect(401);
      expect(response.body).toEqual({
        error: ERROR_MESSAGES.invalidCredentials,
      });
    });

    it.each([
      ["an empty body", undefined],
      ["a missing password", { email: "maria.lopez@example.com" }],
      ["a non-string email", { email: 42, password: SEED_PASSWORD }],
      ["an empty email", { email: "", password: SEED_PASSWORD }],
      ["an array", [1, 2]],
    ])("answers 400 for %s", async (_, body) => {
      const response = await t
        .http()
        .post("/api/auth/login")
        .send(body)
        .expect(400);
      expect(errorOf(response)).toMatch(/email|password|expected/i);
    });

    it("answers 400 { error } for JSON that doesn't parse", async () => {
      const response = await t
        .http()
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send('{"email": "maria.lopez@example.com",')
        .expect(400);
      expect(typeof errorOf(response)).toBe("string");
    });
  });

  describe("login throttle (per account)", () => {
    // A spoofed X-Forwarded-For per attempt stands in for a client rotating IPs, or for
    // the rotating proxy addresses the API sees behind Vercel and Railway.
    function attempt(email: string, password: string, ip = "203.0.113.10") {
      return t
        .http()
        .post("/api/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email, password });
    }

    it("blocks the 11th failure for an account, then the right password too, until the window passes", async () => {
      const email = emailOf("nurse-2");
      for (let i = 0; i < LOGIN_THROTTLE.maxPerAccount; i++) {
        const response = await attempt(email, "wrong");
        expect(response.status, `attempt ${i + 1}`).toBe(401);
      }
      const blocked = await attempt(email, "wrong").expect(429);
      expect(blocked.body).toEqual({
        error: ERROR_MESSAGES.tooManyLoginAttempts,
      });
      // Checked before the password: the correct one is refused within the window.
      const correct = await attempt(email, SEED_PASSWORD).expect(429);
      expect(errorOf(correct)).toBe(ERROR_MESSAGES.tooManyLoginAttempts);
      // Case and spaces don't make a new counter.
      await attempt(` ${email.toUpperCase()} `, SEED_PASSWORD).expect(429);
      // Other accounts are unaffected.
      await attempt(emailOf("admin-1"), SEED_PASSWORD).expect(200);

      t.clock.advance(LOGIN_THROTTLE.windowMs);
      await attempt(email, SEED_PASSWORD).expect(200);
    });

    it("counts failures from every IP against the same account", async () => {
      // An email no seeded user has, so the lock doesn't leak into other tests.
      const email = "rotating-ips@example.com";
      for (let i = 0; i < LOGIN_THROTTLE.maxPerAccount; i++) {
        const response = await attempt(email, "wrong", `198.51.100.${i + 1}`);
        expect(response.status, `attempt ${i + 1}`).toBe(401);
      }
      const blocked = await attempt(email, "wrong", "198.51.100.200").expect(
        429,
      );
      expect(errorOf(blocked)).toBe(ERROR_MESSAGES.tooManyLoginAttempts);
    });

    it("never counts successful sign-ins, and a success clears the account's counter", async () => {
      const email = emailOf("nurse-1");
      for (let i = 0; i < LOGIN_THROTTLE.maxPerAccount + 2; i++) {
        await attempt(email, SEED_PASSWORD).expect(200);
      }
      for (let i = 0; i < LOGIN_THROTTLE.maxPerAccount - 1; i++) {
        await attempt(email, "wrong").expect(401);
      }
      await attempt(email, SEED_PASSWORD).expect(200);
      // The counter restarted: another nine failures are still answered 401.
      for (let i = 0; i < LOGIN_THROTTLE.maxPerAccount - 1; i++) {
        await attempt(email, "wrong").expect(401);
      }
      await attempt(email, SEED_PASSWORD).expect(200);
    });
  });

  describe("GET /api/auth/me", () => {
    it.each([
      [
        "nurse-1",
        { id: "nurse-1", name: "Maria Lopez", role: "nurse", agencyId: null },
      ],
      [
        "admin-1",
        { id: "admin-1", name: "Alex Kim", role: "admin", agencyId: null },
      ],
      [
        "agency-a",
        {
          id: "agency-a",
          name: "Sunrise Health Staffing",
          role: "agency",
          agencyId: "agency-a",
        },
      ],
      [
        "agency-b",
        {
          id: "agency-b",
          name: "Metro Care Partners",
          role: "agency",
          agencyId: "agency-b",
        },
      ],
    ] as const)("returns %s", async (id, me) => {
      const token = await login(t, id);
      const response = await t
        .http()
        .get("/api/auth/me")
        .set(bearer(token))
        .expect(200);
      expect(MeResponseSchema.parse(response.body)).toEqual(me);
    });
  });

  describe("HTTP hardening", () => {
    it("sends helmet's security headers", async () => {
      const response = await t.http().get("/api/health").expect(200);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-powered-by"]).toBeUndefined();
      expect(response.headers["content-security-policy"]).toBeDefined();
    });
  });
});
