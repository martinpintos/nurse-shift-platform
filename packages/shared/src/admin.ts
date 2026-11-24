import { z } from "zod";
import { UserRoleSchema } from "./auth.js";
import { IdSchema } from "./primitives.js";
import { CancelReasonSchema, ShiftSchema } from "./shifts.js";
import { TimesheetStatusSchema } from "./timesheets.js";

/** One past cancellation. Cancelling reopens the shift; this keeps the history. */
export const ShiftCancellationRecordSchema = z.strictObject({
  reason: CancelReasonSchema,
  previousNurseId: IdSchema,
  cancelledBy: IdSchema,
  cancelledByRole: UserRoleSchema,
  cancelledAt: z.iso.datetime(),
});
export type ShiftCancellationRecord = z.infer<
  typeof ShiftCancellationRecordSchema
>;

/** A shift as the admin dashboard sees it: the spec shape plus history. */
export const AdminShiftSchema = ShiftSchema.extend({
  /** Newest first. */
  cancellations: z.array(ShiftCancellationRecordSchema),
  /** The current claim's timesheet, if one was submitted. */
  timesheetStatus: TimesheetStatusSchema.nullable(),
});
export type AdminShift = z.infer<typeof AdminShiftSchema>;

/** GET /api/admin/shifts 200 response (polled by the dashboard). */
export const AdminShiftListResponseSchema = z.strictObject({
  shifts: z.array(AdminShiftSchema),
});
export type AdminShiftListResponse = z.infer<
  typeof AdminShiftListResponseSchema
>;

export const AuditActionSchema = z.enum([
  "shift.posted",
  "shift.claimed",
  "shift.cancelled",
  "credential.uploaded",
  "timesheet.submitted",
  "timesheet.approved",
  "admin.reset",
  "licenses.exported",
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditEntityTypeSchema = z.enum([
  "shift",
  "credential",
  "timesheet",
  "system",
]);
export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;

/** Audit details hold ids and enum values only, never names, emails or documents. */
export const AuditDetailsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const AuditLogEntrySchema = z.strictObject({
  id: IdSchema,
  at: z.iso.datetime(),
  actorId: IdSchema,
  actorRole: UserRoleSchema,
  action: AuditActionSchema,
  entityType: AuditEntityTypeSchema,
  entityId: IdSchema.nullable(),
  details: AuditDetailsSchema,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

/** GET /api/admin/audit-log query: newest first, up to `limit` entries. */
export const AuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

/** GET /api/admin/audit-log 200 response. */
export const AuditLogResponseSchema = z.strictObject({
  entries: z.array(AuditLogEntrySchema),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

export const OutboxTemplateSchema = z.enum([
  "shift.claimed",
  "shift.cancelled",
]);
export type OutboxTemplate = z.infer<typeof OutboxTemplateSchema>;

/** A notification that would have been emailed. The demo stores it instead of sending. */
export const OutboxMessageSchema = z.strictObject({
  id: IdSchema,
  createdAt: z.iso.datetime(),
  template: OutboxTemplateSchema,
  shiftId: IdSchema,
  recipientId: IdSchema,
  recipientEmail: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type OutboxMessage = z.infer<typeof OutboxMessageSchema>;

/** GET /api/admin/outbox 200 response, newest first. */
export const OutboxResponseSchema = z.strictObject({
  messages: z.array(OutboxMessageSchema),
});
export type OutboxResponse = z.infer<typeof OutboxResponseSchema>;

/** POST /api/admin/reset 200 response. The database is back to the spec's seed. */
export const ResetResponseSchema = z.strictObject({
  status: z.literal("reset"),
});
export type ResetResponse = z.infer<typeof ResetResponseSchema>;
