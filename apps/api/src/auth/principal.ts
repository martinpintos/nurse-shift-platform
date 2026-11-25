import { IdSchema, UserRoleSchema, type UserRole } from "@repo/shared";
import { z } from "zod";

/**
 * The caller of an authenticated request, read from the verified token. Agency logins act
 * for `agencyId` (their user id is the agency id); everyone else has `agencyId: null`.
 */
export interface Principal {
  id: string;
  role: UserRole;
  agencyId: string | null;
}

/** The claims a ShiftPatch token carries besides the registered ones (`sub` is the user id). */
export const TokenClaimsSchema = z
  .object({
    sub: IdSchema,
    role: UserRoleSchema,
    agencyId: IdSchema.nullable(),
  })
  .refine(
    (claims) => (claims.role === "agency") === (claims.agencyId !== null),
    {
      message: "agencyId must be set exactly for agency logins",
    },
  );

/** Maps verified claims to the caller, or `null` when they don't describe one of our users. */
export function principalFromClaims(claims: unknown): Principal | null {
  const parsed = TokenClaimsSchema.safeParse(claims);
  if (!parsed.success) return null;
  const { sub, role, agencyId } = parsed.data;
  return { id: sub, role, agencyId };
}

declare module "@nestjs/authentication" {
  interface AuthenticationTypes {
    user: Principal;
    // Tokens only: the client signs in again when one expires (8h).
    refreshTokens: false;
  }
}
