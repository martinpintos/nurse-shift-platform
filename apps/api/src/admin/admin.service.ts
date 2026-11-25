import { Inject, Injectable } from "@nestjs/common";
import {
  type AdminShiftListResponse,
  type AuditLogEntry,
  type AuditLogResponse,
  type OutboxResponse,
  type ResetResponse,
} from "@repo/shared";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { recordAudit, toAuditLogEntryDto } from "../audit/audit.js";
import type { Principal } from "../auth/principal.js";
import { Clock, utcToday } from "../common/clock.js";
import { toOutboxMessageDto } from "../outbox/outbox.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { resolvePeople, resolveRefs } from "../refs/refs.js";
import { seedDatabase } from "../seed/seed.js";
import { buildLicenseExport, type LicenseExport } from "./license-export.js";
import {
  compareShifts,
  fromDbCancelReason,
  toShiftDto,
  withAgencyName,
} from "../shifts/shift.mapper.js";

/** The outbox listing shows this many newest messages. */
export const OUTBOX_LIMIT = 200;

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  /** The dashboard feed: every shift, its cancellations and the current claim's timesheet. */
  async shifts(): Promise<AdminShiftListResponse> {
    const rows = await this.prisma.shift.findMany({
      include: {
        ...withAgencyName,
        cancellations: { orderBy: [{ cancelledAt: "desc" }, { id: "asc" }] },
        timesheets: { select: { nurseId: true, status: true } },
      },
      orderBy: { date: "asc" },
    });
    const shifts = rows.map((row) => ({
      ...toShiftDto(row),
      cancellations: row.cancellations.map((cancellation) => ({
        reason: fromDbCancelReason(cancellation.reason),
        previousNurseId: cancellation.previousNurseId,
        cancelledBy: cancellation.cancelledById,
        cancelledByRole: cancellation.cancelledByRole,
        cancelledAt: cancellation.cancelledAt.toISOString(),
      })),
      timesheetStatus:
        row.claimedById === null
          ? null
          : (row.timesheets.find((t) => t.nurseId === row.claimedById)
              ?.status ?? null),
    }));
    // The shifts are the response itself, so refs only names the people on them.
    const people = await resolvePeople(
      this.prisma,
      shifts.flatMap((shift) => [
        shift.claimedBy,
        ...shift.cancellations.flatMap((c) => [
          c.previousNurseId,
          c.cancelledBy,
        ]),
      ]),
    );
    return { shifts: shifts.sort(compareShifts), refs: { people, shifts: {} } };
  }

  async auditLog(limit: number): Promise<AuditLogResponse> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { seq: "desc" },
      take: limit,
    });
    const entries = rows.map(toAuditLogEntryDto);
    const detail = (details: AuditLogEntry["details"], key: string) => {
      const value = details[key];
      return typeof value === "string" ? value : null;
    };
    const refs = await resolveRefs(this.prisma, {
      userIds: entries.flatMap((e) => [
        e.actorId,
        detail(e.details, "previousNurseId"),
        detail(e.details, "nurseId"),
      ]),
      shiftIds: entries.flatMap((e) => [
        e.entityType === "shift" ? e.entityId : null,
        detail(e.details, "shiftId"),
      ]),
    });
    return { entries, refs };
  }

  async outbox(): Promise<OutboxResponse> {
    const rows = await this.prisma.outboxMessage.findMany({
      orderBy: { seq: "desc" },
      take: OUTBOX_LIMIT,
    });
    const refs = await resolveRefs(this.prisma, {
      userIds: rows.map((m) => m.recipientId),
      shiftIds: rows.map((m) => m.shiftId),
    });
    return { messages: rows.map(toOutboxMessageDto), refs };
  }

  /** Restores the spec's sample data; the reset itself is the new log's first entry. */
  async reset(admin: Principal): Promise<ResetResponse> {
    await seedDatabase(this.prisma, "reset", (tx) =>
      recordAudit(tx, admin, {
        action: "admin.reset",
        entityType: "system",
        entityId: null,
      }),
    );
    return { status: "reset" };
  }

  /**
   * The inspector's export: license documents and a compliance CSV, built and audited in
   * one transaction, so every export that leaves the system is in the audit log.
   */
  async exportLicenses(admin: Principal): Promise<LicenseExport> {
    const today = utcToday(this.clock);
    const result = await this.prisma.$transaction(async (tx) => {
      const nurses = await tx.user.findMany({
        where: { role: "nurse" },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      });
      const credentials = await tx.credential.findMany({
        select: {
          id: true,
          nurseId: true,
          fileName: true,
          expiresOn: true,
          data: true,
        },
        orderBy: [{ nurseId: "asc" }, { uploadedAt: "asc" }, { id: "asc" }],
      });
      const built = buildLicenseExport({
        nurses,
        credentials,
        today,
        exportedBy: admin.id,
      });
      await recordAudit(tx, admin, {
        action: "licenses.exported",
        entityType: "system",
        entityId: null,
        details: { documents: built.documents, nurses: built.nurses },
      });
      return built;
    });
    this.analytics.capture("licenses_exported", admin.id, {
      documents: result.documents,
      nurses: result.nurses,
    });
    return result;
  }
}
