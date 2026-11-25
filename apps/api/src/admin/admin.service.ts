import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminShiftListResponse,
  AuditLogResponse,
  OutboxResponse,
  ResetResponse,
} from "@repo/shared";
import { recordAudit, toAuditLogEntryDto } from "../audit/audit.js";
import type { Principal } from "../auth/principal.js";
import { toOutboxMessageDto } from "../outbox/outbox.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedDatabase } from "../seed/seed.js";
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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    return { shifts: shifts.sort(compareShifts) };
  }

  async auditLog(limit: number): Promise<AuditLogResponse> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { seq: "desc" },
      take: limit,
    });
    return { entries: rows.map(toAuditLogEntryDto) };
  }

  async outbox(): Promise<OutboxResponse> {
    const rows = await this.prisma.outboxMessage.findMany({
      orderBy: { seq: "desc" },
      take: OUTBOX_LIMIT,
    });
    return { messages: rows.map(toOutboxMessageDto) };
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
}
