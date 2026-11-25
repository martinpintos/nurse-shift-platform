import {
  CancelReasonSchema,
  CredentialStatusSchema,
  IdSchema,
  ShiftRoleSchema,
  UserRoleSchema,
} from "@repo/shared";
import { z } from "zod";

/**
 * The only events ShiftPatch sends to PostHog, and the only properties each may carry:
 * ids and enum values. Never names, emails, dates of birth, credential contents or any
 * health data (TB results are not even stored, see ESCALATION.md). Schemas are strict, so
 * an extra property is a bug that drops the event instead of leaking it.
 */
const Count = z.number().int().min(0);

export const ANALYTICS_EVENTS = {
  user_logged_in: z.strictObject({ role: UserRoleSchema }),
  shift_posted: z.strictObject({
    shift_id: IdSchema,
    agency_id: IdSchema,
    shift_role: ShiftRoleSchema,
  }),
  shift_claimed: z.strictObject({ shift_id: IdSchema, agency_id: IdSchema }),
  shift_claim_blocked: z.strictObject({
    shift_id: IdSchema,
    reason: z.enum(["credential_expired", "no_credential"]),
  }),
  shift_cancelled: z.strictObject({
    shift_id: IdSchema,
    agency_id: IdSchema,
    reason: CancelReasonSchema,
    by_role: UserRoleSchema,
  }),
  timesheet_submitted: z.strictObject({
    timesheet_id: IdSchema,
    shift_id: IdSchema,
  }),
  timesheet_approved: z.strictObject({
    timesheet_id: IdSchema,
    shift_id: IdSchema,
  }),
  credential_uploaded: z.strictObject({
    credential_id: IdSchema,
    status: CredentialStatusSchema,
  }),
  licenses_exported: z.strictObject({ documents: Count, nurses: Count }),
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsProperties<E extends AnalyticsEventName> = z.infer<
  (typeof ANALYTICS_EVENTS)[E]
>;
