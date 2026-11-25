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
  type AgencyShiftListResponse,
  type CancelReason,
  type CancelShiftResponse,
  type CreateShiftRequest,
  type Shift,
  type ShiftListResponse,
} from "@repo/shared";
import { recordAudit } from "../audit/audit.js";
import type { Principal } from "../auth/principal.js";
import {
  agencyRecipients,
  cancelledMessages,
  claimedMessages,
  queueOutbox,
  type Recipient,
} from "../outbox/outbox.js";
import type { Tx } from "../prisma/db.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  compareShifts,
  parseDbDate,
  toDbCancelReason,
  toShiftDto,
  withAgencyName,
} from "./shift.mapper.js";

/** The agency an agency login acts for. The token guarantees it is set for that role. */
export function agencyOf(principal: Principal): string {
  if (principal.agencyId === null) {
    throw new ForbiddenException(ERROR_MESSAGES.forbidden);
  }
  return principal.agencyId;
}

@Injectable()
export class ShiftsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  /** Every shift, ordered by date, then numeric id. */
  async list(): Promise<ShiftListResponse> {
    const rows = await this.prisma.shift.findMany({
      include: withAgencyName,
      orderBy: { date: "asc" },
    });
    return { shifts: rows.map(toShiftDto).sort(compareShifts) };
  }

  /** An agency's own shifts; the admin may ask for any agency. */
  async listForAgency(
    principal: Principal,
    agencyId: string,
  ): Promise<AgencyShiftListResponse> {
    if (principal.role === "agency" && agencyOf(principal) !== agencyId) {
      throw new ForbiddenException(ERROR_MESSAGES.notYourAgency);
    }
    const rows = await this.prisma.shift.findMany({
      where: { agencyId },
      include: withAgencyName,
      orderBy: { date: "asc" },
    });
    return { agencyId, shifts: rows.map(toShiftDto).sort(compareShifts) };
  }

  /** Posts an open shift for the caller's own agency (never one named in the body). */
  async create(principal: Principal, body: CreateShiftRequest): Promise<Shift> {
    const shift = await this.createCommitted(principal, body);
    this.analytics.capture("shift_posted", principal.id, {
      shift_id: shift.id,
      agency_id: shift.agencyId,
      shift_role: shift.role,
    });
    return shift;
  }

  /**
   * A nurse claims an open shift. Analytics records the claim, or the credential block,
   * after the transaction settles.
   */
  async claim(nurse: Principal, shiftId: string): Promise<Shift> {
    try {
      const shift = await this.claimCommitted(nurse, shiftId);
      this.analytics.capture("shift_claimed", nurse.id, {
        shift_id: shift.id,
        agency_id: shift.agencyId,
      });
      return shift;
    } catch (error) {
      const blocked = claimBlockReason(error);
      if (blocked) {
        this.analytics.capture("shift_claim_blocked", nurse.id, {
          shift_id: shiftId,
          reason: blocked,
        });
      }
      throw error;
    }
  }

  async cancel(
    principal: Principal,
    shiftId: string,
    reason: CancelReason,
  ): Promise<CancelShiftResponse> {
    const result = await this.cancelCommitted(principal, shiftId, reason);
    this.analytics.capture("shift_cancelled", principal.id, {
      shift_id: result.id,
      agency_id: result.agencyId,
      reason,
      by_role: principal.role,
    });
    return result;
  }

  private async createCommitted(
    principal: Principal,
    body: CreateShiftRequest,
  ): Promise<Shift> {
    const agencyId = agencyOf(principal);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.shift.create({
        data: {
          agencyId,
          role: body.role,
          date: parseDbDate(body.date),
          startTime: body.startTime,
          endTime: body.endTime,
        },
        include: withAgencyName,
      });
      await recordAudit(tx, principal, {
        action: "shift.posted",
        entityType: "shift",
        entityId: row.id,
        details: { agencyId, role: row.role },
      });
      return toShiftDto(row);
    });
  }

  /**
   * A nurse claims an open shift. Her latest credential must not expire before the shift
   * date (not today: a past shift is checked against its own date). The claim itself is a
   * conditional update on `status = 'open'`, so of two concurrent claims exactly one wins.
   */
  private async claimCommitted(
    nurse: Principal,
    shiftId: string,
  ): Promise<Shift> {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({ where: { id: shiftId } });
      if (!shift) throw new NotFoundException(ERROR_MESSAGES.shiftNotFound);

      const { _max } = await tx.credential.aggregate({
        where: { nurseId: nurse.id },
        _max: { expiresOn: true },
      });
      if (!_max.expiresOn) {
        throw new ForbiddenException(ERROR_MESSAGES.noCredential);
      }
      if (_max.expiresOn.getTime() < shift.date.getTime()) {
        throw new ForbiddenException(ERROR_MESSAGES.credentialExpired);
      }

      const { count } = await tx.shift.updateMany({
        where: { id: shiftId, status: "open" },
        data: { status: "filled", claimedById: nurse.id },
      });
      if (count === 0) {
        throw new ConflictException(ERROR_MESSAGES.shiftAlreadyFilled);
      }

      const claimed = toShiftDto(
        await tx.shift.findUniqueOrThrow({
          where: { id: shiftId },
          include: withAgencyName,
        }),
      );
      await recordAudit(tx, nurse, {
        action: "shift.claimed",
        entityType: "shift",
        entityId: shiftId,
        details: { agencyId: claimed.agencyId },
      });
      await queueOutbox(
        tx,
        claimedMessages(
          claimed,
          await recipient(tx, nurse.id),
          await agencyRecipients(tx, claimed.agencyId),
        ),
      );
      return claimed;
    });
  }

  /**
   * Cancels the current claim and reopens the shift. Nurses cancel their own claims, in
   * advance only. Agencies cancel claims on their own shifts, for either reason. The admin
   * cancels any. A claim with a submitted or approved timesheet can't be cancelled.
   */
  private async cancelCommitted(
    principal: Principal,
    shiftId: string,
    reason: CancelReason,
  ): Promise<CancelShiftResponse> {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({ where: { id: shiftId } });
      if (!shift) throw new NotFoundException(ERROR_MESSAGES.shiftNotFound);
      if (
        principal.role === "agency" &&
        agencyOf(principal) !== shift.agencyId
      ) {
        throw new ForbiddenException(ERROR_MESSAGES.notYourAgency);
      }
      const previousNurseId = shift.claimedById;
      if (shift.status !== "filled" || previousNurseId === null) {
        throw new ConflictException(ERROR_MESSAGES.shiftNotClaimed);
      }
      if (principal.role === "nurse") {
        if (previousNurseId !== principal.id) {
          throw new ForbiddenException(ERROR_MESSAGES.notYourClaim);
        }
        if (reason !== "advance") {
          throw new ForbiddenException(ERROR_MESSAGES.nurseCancelInAdvanceOnly);
        }
      }

      // Conditional on the claim read above: of two concurrent cancels only one matches.
      // The update also locks the row, so a timesheet submitted meanwhile is seen below.
      const { count } = await tx.shift.updateMany({
        where: { id: shiftId, status: "filled", claimedById: previousNurseId },
        data: { status: "open", claimedById: null },
      });
      if (count === 0) {
        throw new ConflictException(ERROR_MESSAGES.shiftNotClaimed);
      }
      const timesheet = await tx.timesheet.findUnique({
        where: { shiftId_nurseId: { shiftId, nurseId: previousNurseId } },
        select: { id: true },
      });
      if (timesheet) {
        // Rolls the reopening back with the transaction.
        throw new ConflictException(ERROR_MESSAGES.shiftHasTimesheet);
      }

      await tx.shiftCancellation.create({
        data: {
          shiftId,
          reason: toDbCancelReason(reason),
          previousNurseId,
          cancelledById: principal.id,
          cancelledByRole: principal.role,
        },
      });
      const reopened = toShiftDto(
        await tx.shift.findUniqueOrThrow({
          where: { id: shiftId },
          include: withAgencyName,
        }),
      );
      await recordAudit(tx, principal, {
        action: "shift.cancelled",
        entityType: "shift",
        entityId: shiftId,
        details: { agencyId: reopened.agencyId, reason, previousNurseId },
      });
      await queueOutbox(
        tx,
        cancelledMessages(
          reopened,
          reason,
          await recipient(tx, previousNurseId),
          await agencyRecipients(tx, reopened.agencyId),
        ),
      );
      return { ...reopened, cancellation: { reason, previousNurseId } };
    });
  }
}

/** The analytics reason when a claim was refused for the nurse's credential, else null. */
function claimBlockReason(
  error: unknown,
): "credential_expired" | "no_credential" | null {
  if (!(error instanceof ForbiddenException)) return null;
  if (error.message === ERROR_MESSAGES.credentialExpired)
    return "credential_expired";
  if (error.message === ERROR_MESSAGES.noCredential) return "no_credential";
  return null;
}

async function recipient(tx: Tx, userId: string): Promise<Recipient> {
  return tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
}
