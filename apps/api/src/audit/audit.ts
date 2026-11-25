import type {
  AuditAction,
  AuditEntityType,
  AuditLogEntry,
  UserRole,
} from "@repo/shared";
import type { AuditLog } from "../generated/prisma/client.js";
import type { Tx } from "../prisma/db.js";

/** Ids and enum values only: never names, emails or file contents. */
export type AuditDetails = Record<string, string | number | boolean | null>;

export interface AuditActor {
  id: string;
  role: UserRole;
}

export interface AuditRecord {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  details?: AuditDetails;
}

/**
 * Writes one audit entry. Takes the transaction client of the state change it records, so
 * the entry commits (or rolls back) with the change.
 */
export async function recordAudit(
  tx: Tx,
  actor: AuditActor,
  record: AuditRecord,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorRole: actor.role,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      details: record.details ?? {},
    },
  });
}

/** The admin audit-log shape. Rows are only written by `recordAudit`, so the casts hold. */
export function toAuditLogEntryDto(row: AuditLog): AuditLogEntry {
  return {
    id: row.id,
    at: row.at.toISOString(),
    actorId: row.actorId,
    actorRole: row.actorRole,
    action: row.action as AuditAction,
    entityType: row.entityType as AuditEntityType,
    entityId: row.entityId,
    details: row.details as AuditDetails,
  };
}
