import type { UserRole } from "./auth.js";

const ANY_ROLE = [
  "nurse",
  "agency",
  "admin",
] as const satisfies readonly UserRole[];

export interface RouteDefinition {
  method: "GET" | "POST";
  path: `/api/${string}`;
  /** "public" needs no token; otherwise the roles that may call it at all. */
  access: "public" | readonly UserRole[];
  /** Defined in docs/spec.md (its contract can't change). */
  spec: boolean;
}

/**
 * Every API route. Role lists are the outer gate (anyone else gets 403); ownership rules
 * (own agency, own claim) are checked inside the route. The API's contract tests iterate
 * this table, so a route without 401/403 coverage can't slip in.
 */
export const ROUTES = [
  // Spec routes
  { method: "POST", path: "/api/auth/login", access: "public", spec: true },
  { method: "GET", path: "/api/shifts", access: ANY_ROLE, spec: true },
  { method: "POST", path: "/api/shifts", access: ["agency"], spec: true },
  {
    method: "POST",
    path: "/api/shifts/:id/claim",
    access: ["nurse"],
    spec: true,
  },
  {
    method: "POST",
    path: "/api/shifts/:id/cancel",
    access: ANY_ROLE,
    spec: true,
  },
  {
    method: "GET",
    path: "/api/agencies/:agencyId/shifts",
    access: ["agency", "admin"],
    spec: true,
  },

  // Beyond the spec
  { method: "GET", path: "/api/health", access: "public", spec: false },
  { method: "GET", path: "/api/auth/me", access: ANY_ROLE, spec: false },
  {
    method: "GET",
    path: "/api/agencies/:agencyId/people",
    access: ["agency", "admin"],
    spec: false,
  },
  { method: "POST", path: "/api/credentials", access: ["nurse"], spec: false },
  {
    method: "GET",
    path: "/api/credentials",
    access: ["nurse", "admin"],
    spec: false,
  },
  {
    method: "GET",
    path: "/api/credentials/:id/file",
    access: ["nurse", "admin"],
    spec: false,
  },
  { method: "GET", path: "/api/timesheets", access: ANY_ROLE, spec: false },
  { method: "POST", path: "/api/timesheets", access: ["nurse"], spec: false },
  {
    method: "POST",
    path: "/api/timesheets/:id/approve",
    access: ["agency"],
    spec: false,
  },
  { method: "GET", path: "/api/admin/shifts", access: ["admin"], spec: false },
  {
    method: "GET",
    path: "/api/admin/audit-log",
    access: ["admin"],
    spec: false,
  },
  { method: "GET", path: "/api/admin/outbox", access: ["admin"], spec: false },
  { method: "POST", path: "/api/admin/reset", access: ["admin"], spec: false },
  {
    method: "GET",
    path: "/api/admin/exports/licenses",
    access: ["admin"],
    spec: false,
  },
] as const satisfies readonly RouteDefinition[];

export type RoutePath = (typeof ROUTES)[number]["path"];

/** Fills `:params` in a route path, URI-encoding each value. */
export function routePath(
  path: RoutePath,
  params: Record<string, string> = {},
): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing route param "${name}" for ${path}`);
    }
    return encodeURIComponent(value);
  });
}
