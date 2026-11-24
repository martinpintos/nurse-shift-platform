import { z } from "zod";
import { IdSchema, IsoDateSchema, Time24hSchema } from "./primitives.js";

/** The roles the spec uses. Extend here (and in the Prisma enum) when the product needs more. */
export const ShiftRoleSchema = z.enum(["RN", "LPN"]);
export type ShiftRole = z.infer<typeof ShiftRoleSchema>;

export const ShiftStatusSchema = z.enum(["open", "filled", "cancelled"]);
export type ShiftStatus = z.infer<typeof ShiftStatusSchema>;

export const CancelReasonSchema = z.enum(["no-show", "advance"]);
export type CancelReason = z.infer<typeof CancelReasonSchema>;

/**
 * The one shift shape every shift route returns. Strict, so an extra or renamed field
 * fails the contract tests instead of drifting from the spec.
 */
export const ShiftSchema = z.strictObject({
  id: IdSchema,
  agencyId: IdSchema,
  agencyName: z.string(),
  role: ShiftRoleSchema,
  date: IsoDateSchema,
  startTime: Time24hSchema,
  endTime: Time24hSchema,
  status: ShiftStatusSchema,
  /** `null` when the shift is open. */
  claimedBy: IdSchema.nullable(),
});
export type Shift = z.infer<typeof ShiftSchema>;

/** GET /api/shifts 200 response. */
export const ShiftListResponseSchema = z.strictObject({
  shifts: z.array(ShiftSchema),
});
export type ShiftListResponse = z.infer<typeof ShiftListResponseSchema>;

/**
 * POST /api/shifts request. Unknown keys are stripped, not rejected: a body `agencyId`
 * is ignored because the shift's agency always comes from the token.
 */
export const CreateShiftRequestSchema = z.object({
  role: ShiftRoleSchema,
  date: IsoDateSchema,
  startTime: Time24hSchema,
  endTime: Time24hSchema,
});
export type CreateShiftRequest = z.infer<typeof CreateShiftRequestSchema>;

/** POST /api/shifts/:id/cancel request. */
export const CancelShiftRequestSchema = z.object({
  reason: CancelReasonSchema,
});
export type CancelShiftRequest = z.infer<typeof CancelShiftRequestSchema>;

export const CancellationSchema = z.strictObject({
  reason: CancelReasonSchema,
  previousNurseId: IdSchema,
});
export type Cancellation = z.infer<typeof CancellationSchema>;

/** POST /api/shifts/:id/cancel 200 response: the reopened shift plus the cancellation. */
export const CancelShiftResponseSchema = ShiftSchema.extend({
  cancellation: CancellationSchema,
});
export type CancelShiftResponse = z.infer<typeof CancelShiftResponseSchema>;

/** GET /api/agencies/:agencyId/shifts 200 response, with full shifts ("same shape as above"). */
export const AgencyShiftListResponseSchema = z.strictObject({
  agencyId: IdSchema,
  shifts: z.array(ShiftSchema),
});
export type AgencyShiftListResponse = z.infer<
  typeof AgencyShiftListResponseSchema
>;
