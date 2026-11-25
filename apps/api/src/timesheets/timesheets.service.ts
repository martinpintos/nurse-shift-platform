import { AnalyticsService } from "../analytics/analytics.service.js";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ERROR_MESSAGES,
  timesheetMinutes,
  type SubmitTimesheetRequest,
  type Timesheet,
  type TimesheetListResponse,
} from "@repo/shared";
import { recordAudit } from "../audit/audit.js";
import type { Principal } from "../auth/principal.js";
import { Clock } from "../common/clock.js";
import {
  Prisma,
  type Timesheet as TimesheetRow,
} from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { agencyOf } from "../shifts/shifts.service.js";
import { formatDbDate } from "../shifts/shift.mapper.js";

const withShift = {
  shift: { select: { agencyId: true, date: true } },
} as const;

export function toTimesheetDto(
  row: TimesheetRow & { shift: { agencyId: string; date: Date } },
): Timesheet {
  return {
    id: row.id,
    shiftId: row.shiftId,
    nurseId: row.nurseId,
    agencyId: row.shift.agencyId,
    date: formatDbDate(row.shift.date),
    actualStart: row.actualStart,
    actualEnd: row.actualEnd,
    minutesWorked: row.minutesWorked,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedById,
  };
}

@Injectable()
export class TimesheetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  /** A nurse's own; an agency's for its own shifts; the admin's, all. Newest first. */
  async list(principal: Principal): Promise<TimesheetListResponse> {
    const where =
      principal.role === "nurse"
        ? { nurseId: principal.id }
        : principal.role === "agency"
          ? { shift: { agencyId: agencyOf(principal) } }
          : {};
    const rows = await this.prisma.timesheet.findMany({
      where,
      include: withShift,
      orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
    });
    return { timesheets: rows.map(toTimesheetDto) };
  }

  /** A nurse submits actual hours for a shift she holds the claim on, once. */
  async submit(
    nurse: Principal,
    body: SubmitTimesheetRequest,
  ): Promise<Timesheet> {
    const timesheet = await this.submitCommitted(nurse, body);
    this.analytics.capture("timesheet_submitted", nurse.id, {
      timesheet_id: timesheet.id,
      shift_id: timesheet.shiftId,
    });
    return timesheet;
  }

  /** An agency approves a submitted timesheet on one of its own shifts. */
  async approve(principal: Principal, id: string): Promise<Timesheet> {
    const timesheet = await this.approveCommitted(principal, id);
    this.analytics.capture("timesheet_approved", principal.id, {
      timesheet_id: timesheet.id,
      shift_id: timesheet.shiftId,
    });
    return timesheet;
  }

  private async submitCommitted(
    nurse: Principal,
    body: SubmitTimesheetRequest,
  ): Promise<Timesheet> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Lock the shift row: a concurrent cancel then either reopens it first (and this
        // sees it isn't hers) or waits for this timesheet and refuses to cancel.
        await tx.$queryRaw`SELECT "id" FROM "Shift" WHERE "id" = ${body.shiftId} FOR UPDATE`;
        const shift = await tx.shift.findUnique({
          where: { id: body.shiftId },
          select: { status: true, claimedById: true, agencyId: true },
        });
        if (!shift) throw new NotFoundException(ERROR_MESSAGES.shiftNotFound);
        if (shift.status !== "filled" || shift.claimedById !== nurse.id) {
          throw new ForbiddenException(ERROR_MESSAGES.timesheetNotYourShift);
        }
        const existing = await tx.timesheet.findUnique({
          where: {
            shiftId_nurseId: { shiftId: body.shiftId, nurseId: nurse.id },
          },
          select: { id: true },
        });
        if (existing)
          throw new ConflictException(ERROR_MESSAGES.timesheetExists);

        const row = await tx.timesheet.create({
          data: {
            shiftId: body.shiftId,
            nurseId: nurse.id,
            actualStart: body.actualStart,
            actualEnd: body.actualEnd,
            minutesWorked: timesheetMinutes(body.actualStart, body.actualEnd),
          },
          include: withShift,
        });
        await recordAudit(tx, nurse, {
          action: "timesheet.submitted",
          entityType: "timesheet",
          entityId: row.id,
          details: { shiftId: row.shiftId, agencyId: shift.agencyId },
        });
        return toTimesheetDto(row);
      });
    } catch (error) {
      // The unique (shiftId, nurseId) index catches a duplicate the check above raced past.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(ERROR_MESSAGES.timesheetExists);
      }
      throw error;
    }
  }

  private async approveCommitted(
    principal: Principal,
    id: string,
  ): Promise<Timesheet> {
    const agencyId = agencyOf(principal);
    return this.prisma.$transaction(async (tx) => {
      const timesheet = await tx.timesheet.findUnique({
        where: { id },
        include: withShift,
      });
      if (!timesheet)
        throw new NotFoundException(ERROR_MESSAGES.timesheetNotFound);
      if (timesheet.shift.agencyId !== agencyId) {
        throw new ForbiddenException(ERROR_MESSAGES.notYourAgency);
      }
      const { count } = await tx.timesheet.updateMany({
        where: { id, status: "submitted" },
        data: {
          status: "approved",
          approvedAt: this.clock.now(),
          approvedById: principal.id,
        },
      });
      if (count === 0) {
        throw new ConflictException(ERROR_MESSAGES.timesheetAlreadyApproved);
      }
      const approved = await tx.timesheet.findUniqueOrThrow({
        where: { id },
        include: withShift,
      });
      await recordAudit(tx, principal, {
        action: "timesheet.approved",
        entityType: "timesheet",
        entityId: id,
        details: { shiftId: approved.shiftId, nurseId: approved.nurseId },
      });
      return toTimesheetDto(approved);
    });
  }
}
