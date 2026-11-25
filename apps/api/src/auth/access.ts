import { Public } from "@nestjs/authentication";
import { Can, Policy } from "@nestjs/authorization";
import { ROUTES, type UserRole } from "@repo/shared";
import type { Principal } from "./principal.js";

/** `"POST /api/shifts"`: a route of the shared `ROUTES` table, by method and path. */
export type RouteKey = (typeof ROUTES)[number] extends infer Route
  ? Route extends {
      method: infer M extends string;
      path: infer P extends string;
    }
    ? `${M} ${P}`
    : never
  : never;

/** The outer gate of every route: the caller's role must be one the route lists. */
@Policy()
export class RolePolicy {
  hasRole(user: Principal | null, roles: readonly UserRole[]): boolean {
    return user !== null && roles.includes(user.role);
  }
}

/**
 * Applies a route's access rule from `ROUTES` in `@repo/shared`, the one table the web app
 * and the contract tests read too: `@Public()` for public routes, otherwise a role check
 * (403 for any other role). Ownership rules (own agency, own claim) are checked inside the
 * route. `@nestjs/authorization` denies any handler without a check, so a route can't be
 * left open by forgetting this.
 */
export function Access(key: RouteKey): ClassDecorator & MethodDecorator {
  const route = ROUTES.find((r) => `${r.method} ${r.path}` === key);
  if (!route) {
    throw new Error(`Access(): ${key} is not in ROUTES (@repo/shared)`);
  }
  if (route.access === "public") {
    return Public();
  }
  const roles: readonly UserRole[] = route.access;
  return Can(RolePolicy, "hasRole", () => [roles] as const);
}
