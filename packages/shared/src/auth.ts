import { z } from "zod";
import { IdSchema } from "./primitives.js";

export const UserRoleSchema = z.enum(["nurse", "agency", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * POST /api/auth/login request.
 *
 * Deliberately permissive: any well-formed body that fails to match a user gets the same
 * 401 "Invalid email or password", so validation never reveals which part was wrong.
 */
export const LoginRequestSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  role: UserRoleSchema,
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/** POST /api/auth/login 200 response. Same shape for every role. */
export const LoginResponseSchema = z.strictObject({
  token: z.string().min(1),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * GET /api/auth/me 200 response: the signed-in user, plus the agency they act for.
 * Agency logins use their agencyId as their user id (agency-a), per the spec's agency table.
 */
export const MeResponseSchema = AuthUserSchema.extend({
  agencyId: IdSchema.nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
