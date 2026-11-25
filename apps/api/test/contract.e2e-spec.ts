import { ConfigService } from "@nestjs/config";
import { JwtSigner, type JwtClaims } from "@nestjs/authentication";
import {
  AdminShiftListResponseSchema,
  AgencyShiftListResponseSchema,
  AuditLogResponseSchema,
  CancelShiftResponseSchema,
  CredentialListResponseSchema,
  CredentialSchema,
  ERROR_MESSAGES,
  LoginResponseSchema,
  MeResponseSchema,
  OutboxResponseSchema,
  ResetResponseSchema,
  ROUTES,
  ShiftListResponseSchema,
  ShiftSchema,
  TimesheetListResponseSchema,
  TimesheetSchema,
  UserRoleSchema,
  routePath,
  type UserRole,
} from "@repo/shared";
import { z } from "zod";
import type { RouteKey } from "../src/auth/access.js";
import { JWT_AUDIENCE, JWT_ISSUER } from "../src/auth/jwt-auth.provider.js";
import type { Env } from "../src/config/env.js";
import { SEED_CREDENTIALS, SEED_PASSWORD } from "../src/seed/seed-data.js";
import { binaryParser } from "./binary.js";
import {
  SAMPLE_FILES,
  bearer,
  createTestApp,
  errorOf,
  loginAll,
  resetDatabase,
  uploadCredential,
  type SeedUserId,
  type TestApp,
} from "./helpers.js";

type Route = (typeof ROUTES)[number];

const ROLE_USER: Record<UserRole, SeedUserId> = {
  nurse: "nurse-1",
  agency: "agency-a",
  admin: "admin-1",
};

const PARAMS = { id: "shift-1", agencyId: "agency-a" };

function call(t: TestApp, route: Route) {
  const path = routePath(route.path, PARAMS);
  return route.method === "GET" ? t.http().get(path) : t.http().post(path);
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const protectedRoutes = ROUTES.filter((route) => route.access !== "public");

describe("contract: every route in ROUTES", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;
  let badTokens: [string, string][];

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t);
    tokens = await loginAll(t);

    const secret = t.app
      .get<ConfigService<Env, true>>(ConfigService)
      .get("JWT_SECRET", { infer: true });
    const claims: JwtClaims = { sub: "admin-1", role: "admin", agencyId: null };
    const signer = (
      options: {
        key?: string;
        issuer?: string;
        audience?: string;
        now?: () => number;
      } = {},
    ) =>
      new JwtSigner({
        key: secret,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        ttl: "8h",
        ...options,
      });
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({
      ...claims,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      iat: now,
      exp: now + 3600,
    })}.`;
    badTokens = [
      ["a malformed token", "not-a-jwt"],
      ["a Bearer header with two values", "a b"],
      [
        "an expired token",
        signer({ now: () => Date.now() - 9 * 3600_000 }).sign(claims),
      ],
      [
        "a token signed with another key",
        signer({ key: "k".repeat(48) }).sign(claims),
      ],
      [
        "a token for another audience",
        signer({ audience: "someone-else" }).sign(claims),
      ],
      [
        "a token from another issuer",
        signer({ issuer: "someone-else" }).sign(claims),
      ],
      ["an unsigned token (alg none)", unsigned],
      [
        "a token whose claims describe no valid caller",
        signer().sign({ sub: "agency-a", role: "agency", agencyId: null }),
      ],
      [
        "a token with an unknown role",
        signer().sign({ sub: "root", role: "superuser", agencyId: null }),
      ],
    ];
  });

  afterAll(async () => {
    await t.close();
  });

  it("requires a token on every route but login and health", () => {
    expect(
      ROUTES.filter((route) => route.access === "public")
        .map((route) => `${route.method} ${route.path}`)
        .sort(),
    ).toEqual(["GET /api/health", "POST /api/auth/login"]);
  });

  describe.each(protectedRoutes)("$method $path", (route) => {
    it("answers 401 Authentication required without a token", async () => {
      const response = await call(t, route).expect(401);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.authRequired);
      expect(response.headers["www-authenticate"]).toContain("Bearer");
    });

    it("answers 401 Authentication required for a non-Bearer scheme", async () => {
      const response = await call(t, route)
        .set("Authorization", `Basic ${Buffer.from("a:b").toString("base64")}`)
        .expect(401);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.authRequired);
    });

    it("answers 401 Invalid or expired token for every bad token", async () => {
      for (const [description, token] of badTokens) {
        const response = await call(t, route).set(bearer(token));
        expect(response.status, description).toBe(401);
        expect(errorOf(response), description).toBe(
          ERROR_MESSAGES.invalidToken,
        );
      }
    });

    const access = route.access as readonly UserRole[];
    const denied = UserRoleSchema.options.filter(
      (role) => !access.includes(role),
    );

    it.runIf(denied.length > 0)(
      `answers 403 to every role it doesn't list (${denied.join(", ") || "none"})`,
      async () => {
        for (const role of denied) {
          const response = await call(t, route).set(
            bearer(tokens[ROLE_USER[role]]),
          );
          expect(response.status, role).toBe(403);
          expect(errorOf(response), role).toBe(ERROR_MESSAGES.forbidden);
        }
      },
    );
  });

  describe("the roles a route lists pass its role gate", () => {
    afterAll(async () => {
      await resetDatabase(t);
    });

    it.each(protectedRoutes)("$method $path", async (route) => {
      for (const role of route.access as readonly UserRole[]) {
        const response = await call(t, route).set(
          bearer(tokens[ROLE_USER[role]]),
        );
        // Ownership rules or validation may still refuse; the role gate must not.
        expect(response.status, role).not.toBe(401);
        expect(
          response.status === 403 &&
            errorOf(response) === ERROR_MESSAGES.forbidden,
          `${role} was refused by the role gate`,
        ).toBe(false);
      }
    });
  });

  describe("every success response parses with its shared schema", () => {
    interface Success {
      status: number;
      body: unknown;
      schema: z.ZodType;
      expected: number;
    }

    async function success(
      request: PromiseLike<{ status: number; body: unknown }>,
      schema: z.ZodType,
      expected: number,
    ): Promise<Success> {
      const { status, body } = await request;
      return { status, body, schema, expected };
    }

    const submitTimesheet = () =>
      t
        .http()
        .post("/api/timesheets")
        .set(bearer(tokens["nurse-1"]))
        .send({ shiftId: "shift-2", actualStart: "07:00", actualEnd: "19:00" });

    // Typed by RouteKey: a route added to ROUTES without a case here fails type-check.
    const cases: Record<RouteKey, () => Promise<Success>> = {
      "POST /api/auth/login": () =>
        success(
          t.http().post("/api/auth/login").send({
            email: "maria.lopez@example.com",
            password: SEED_PASSWORD,
          }),
          LoginResponseSchema,
          200,
        ),
      "GET /api/shifts": () =>
        success(
          t.http().get("/api/shifts").set(bearer(tokens["nurse-1"])),
          ShiftListResponseSchema,
          200,
        ),
      "POST /api/shifts": () =>
        success(
          t.http().post("/api/shifts").set(bearer(tokens["agency-a"])).send({
            role: "RN",
            date: "2026-10-05",
            startTime: "07:00",
            endTime: "19:00",
          }),
          ShiftSchema,
          201,
        ),
      "POST /api/shifts/:id/claim": () =>
        success(
          t
            .http()
            .post("/api/shifts/shift-1/claim")
            .set(bearer(tokens["nurse-1"])),
          ShiftSchema,
          200,
        ),
      "POST /api/shifts/:id/cancel": () =>
        success(
          t
            .http()
            .post("/api/shifts/shift-2/cancel")
            .set(bearer(tokens["agency-a"]))
            .send({ reason: "no-show" }),
          CancelShiftResponseSchema,
          200,
        ),
      "GET /api/agencies/:agencyId/shifts": () =>
        success(
          t
            .http()
            .get("/api/agencies/agency-a/shifts")
            .set(bearer(tokens["agency-a"])),
          AgencyShiftListResponseSchema,
          200,
        ),
      "GET /api/health": () =>
        success(
          t.http().get("/api/health"),
          z.strictObject({ status: z.literal("ok") }),
          200,
        ),
      "GET /api/auth/me": () =>
        success(
          t.http().get("/api/auth/me").set(bearer(tokens["agency-b"])),
          MeResponseSchema,
          200,
        ),
      "POST /api/credentials": () =>
        success(
          uploadCredential(
            t,
            tokens["nurse-2"],
            SAMPLE_FILES.pdf,
            "license.pdf",
            "2027-12-31",
          ),
          CredentialSchema,
          201,
        ),
      "GET /api/credentials": () =>
        success(
          t.http().get("/api/credentials").set(bearer(tokens["admin-1"])),
          CredentialListResponseSchema,
          200,
        ),
      "GET /api/credentials/:id/file": () =>
        success(
          t
            .http()
            .get(`/api/credentials/${SEED_CREDENTIALS[0]?.id ?? ""}/file`)
            .set(bearer(tokens["nurse-1"]))
            .buffer(true)
            .parse(binaryParser),
          z
            .instanceof(Buffer)
            .refine((body) => body.subarray(0, 5).toString() === "%PDF-"),
          200,
        ),
      "GET /api/timesheets": () =>
        success(
          t.http().get("/api/timesheets").set(bearer(tokens["agency-a"])),
          TimesheetListResponseSchema,
          200,
        ),
      "POST /api/timesheets": () =>
        success(submitTimesheet(), TimesheetSchema, 201),
      "POST /api/timesheets/:id/approve": async () => {
        const { id } = TimesheetSchema.parse(
          (await submitTimesheet().expect(201)).body,
        );
        return success(
          t
            .http()
            .post(`/api/timesheets/${id}/approve`)
            .set(bearer(tokens["agency-a"])),
          TimesheetSchema,
          200,
        );
      },
      "GET /api/admin/shifts": () =>
        success(
          t.http().get("/api/admin/shifts").set(bearer(tokens["admin-1"])),
          AdminShiftListResponseSchema,
          200,
        ),
      "GET /api/admin/audit-log": () =>
        success(
          t
            .http()
            .get("/api/admin/audit-log?limit=5")
            .set(bearer(tokens["admin-1"])),
          AuditLogResponseSchema,
          200,
        ),
      "GET /api/admin/outbox": () =>
        success(
          t.http().get("/api/admin/outbox").set(bearer(tokens["admin-1"])),
          OutboxResponseSchema,
          200,
        ),
      "POST /api/admin/reset": () =>
        success(
          t.http().post("/api/admin/reset").set(bearer(tokens["admin-1"])),
          ResetResponseSchema,
          200,
        ),
    };

    beforeEach(async () => {
      await resetDatabase(t);
    });

    it.each(Object.keys(cases) as RouteKey[])("%s", async (key) => {
      const { status, body, schema, expected } = await cases[key]();
      expect(status, JSON.stringify(body)).toBe(expected);
      expect(schema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    });

    it("has a case for exactly the routes in ROUTES", () => {
      expect(Object.keys(cases).sort()).toEqual(
        ROUTES.map((route) => `${route.method} ${route.path}`).sort(),
      );
    });
  });
});
