import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AgencyShiftListResponseSchema,
  CancelShiftRequestSchema,
  CancelShiftResponseSchema,
  CreateShiftRequestSchema,
  ERROR_MESSAGES,
  ErrorResponseSchema,
  IdSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  ROUTES,
  ShiftListResponseSchema,
  ShiftSchema,
  TEST_IDS,
  UserRoleSchema,
} from "./index.js";

// Read the contract straight from docs/spec.md, so a spec change fails these tests
// instead of silently drifting from the schemas.
const spec = readFileSync(
  fileURLToPath(new URL("../../../docs/spec.md", import.meta.url)),
  "utf8",
);

function routeSections(markdown: string): Map<string, unknown[]> {
  const sections = new Map<string, unknown[]>();
  for (const chunk of markdown.split(/^### /m).slice(1)) {
    const heading = chunk.slice(0, chunk.indexOf("\n")).trim();
    const route = heading.replace(/^\d+\.\s+/, "");
    const examples = [...chunk.matchAll(/```json\n([\s\S]*?)```/g)].map(
      (match) => JSON.parse(match[1] ?? "") as unknown,
    );
    sections.set(route, examples);
  }
  return sections;
}

/**
 * The spec's GET /api/agencies/:agencyId/shifts examples are abbreviated: they list only
 * id, status and claimedBy, while the text says the shifts are the "same shape as above".
 * The real response schema stays strict and requires the full Shift, so these two
 * examples are only checked for the fields they show.
 */
const AbbreviatedAgencyShiftListExample = z.strictObject({
  agencyId: IdSchema,
  shifts: z.array(
    ShiftSchema.pick({ id: true, status: true, claimedBy: true }),
  ),
});

const EXPECTED: Record<string, z.ZodType[]> = {
  "POST /api/auth/login": [
    LoginRequestSchema,
    LoginResponseSchema,
    ErrorResponseSchema,
  ],
  "GET /api/shifts": [ShiftListResponseSchema],
  "POST /api/shifts": [CreateShiftRequestSchema, ShiftSchema],
  "POST /api/shifts/:id/claim": [ShiftSchema, ErrorResponseSchema],
  "POST /api/shifts/:id/cancel": [
    CancelShiftRequestSchema,
    CancelShiftResponseSchema,
  ],
  "GET /api/agencies/:agencyId/shifts": [
    AbbreviatedAgencyShiftListExample,
    AbbreviatedAgencyShiftListExample,
  ],
};

describe("docs/spec.md contract", () => {
  const sections = routeSections(spec);
  const routes = [...sections.keys()].filter((route) =>
    /^(GET|POST) \/api\//.test(route),
  );

  it("covers exactly the routes the spec defines", () => {
    expect(routes.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [route, schemas] of Object.entries(EXPECTED)) {
    it(`parses every ${route} example unchanged`, () => {
      const examples = sections.get(route) ?? [];
      expect(examples).toHaveLength(schemas.length);
      examples.forEach((example, index) => {
        // toEqual also proves no field was stripped by a request schema.
        expect(schemas[index]?.parse(example)).toEqual(example);
      });
    });
  }

  it("requires full shifts in the agency list, not the abbreviated example", () => {
    const [agencyA] = sections.get("GET /api/agencies/:agencyId/shifts") ?? [];
    expect(AgencyShiftListResponseSchema.safeParse(agencyA).success).toBe(
      false,
    );
  });

  it("uses the spec's error messages word for word", () => {
    const messages = new Set(
      [...spec.matchAll(/"error":\s*"([^"<]+)"/g)].map((match) => match[1]),
    );
    expect([...messages].sort()).toEqual(
      [
        ERROR_MESSAGES.invalidCredentials,
        ERROR_MESSAGES.credentialExpired,
      ].sort(),
    );
  });

  it("flags exactly the spec's routes as spec routes in ROUTES", () => {
    const specRoutes = ROUTES.filter((route) => route.spec).map(
      (route) => `${route.method} ${route.path}`,
    );
    expect(specRoutes.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("requires a token on every route except login and health", () => {
    const publicRoutes = ROUTES.filter(
      (route) => route.access === "public",
    ).map((route) => `${route.method} ${route.path}`);
    expect(publicRoutes.sort()).toEqual([
      "GET /api/health",
      "POST /api/auth/login",
    ]);
  });

  it("lists exactly the spec's login roles", () => {
    const line = /Login roles are one of: (.+)\./.exec(spec)?.[1] ?? "";
    const roles = [...line.matchAll(/`([a-z]+)`/g)].map((match) => match[1]);
    expect(roles).toEqual(UserRoleSchema.options);
  });

  it("lists exactly the spec's required test IDs", () => {
    const table = spec.slice(spec.indexOf("## Required test IDs"));
    const ids = [...table.matchAll(/^\| `([a-z-]+)`/gm)].map(
      (match) => match[1],
    );
    expect(ids).toHaveLength(15);
    expect(ids.sort()).toEqual(Object.values(TEST_IDS).sort());
  });
});
