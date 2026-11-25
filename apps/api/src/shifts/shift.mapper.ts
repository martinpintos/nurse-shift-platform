import type { CancelReason, Shift } from "@repo/shared";
import type {
  Agency,
  CancelReason as DbCancelReason,
  Shift as ShiftRow,
} from "../generated/prisma/client.js";

/**
 * Formats a Postgres DATE as `YYYY-MM-DD`. Prisma returns `@db.Date` as a JS Date at UTC
 * midnight, so the date must be read in UTC: local-time getters would shift it a day
 * back anywhere west of UTC.
 */
export function formatDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The inverse of `formatDbDate`: a validated `YYYY-MM-DD` as the Date Prisma writes to a DATE. */
export function parseDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The include every shift query uses, so `toShiftDto` always has the agency name. */
export const withAgencyName = { agency: { select: { name: true } } } as const;

/** The one place a shift row becomes the API's Shift shape (docs/spec.md). */
export function toShiftDto(
  shift: ShiftRow & { agency: Pick<Agency, "name"> },
): Shift {
  return {
    id: shift.id,
    agencyId: shift.agencyId,
    agencyName: shift.agency.name,
    role: shift.role,
    date: formatDbDate(shift.date),
    startTime: shift.startTime,
    endTime: shift.endTime,
    status: shift.status,
    claimedBy: shift.claimedById ?? null,
  };
}

/** The number in `shift-<n>`, so `shift-10` sorts after `shift-9`. */
export function shiftNumber(id: string): number {
  const match = /^shift-(\d+)$/.exec(id);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** Shift list order: by date, then by numeric id. */
export function compareShifts(
  a: Pick<Shift, "id" | "date">,
  b: Pick<Shift, "id" | "date">,
): number {
  return (
    a.date.localeCompare(b.date) ||
    shiftNumber(a.id) - shiftNumber(b.id) ||
    a.id.localeCompare(b.id)
  );
}

// Prisma enum values can't contain "-", so the database enum maps `no_show` to 'no-show'.
const TO_DB_REASON = {
  "no-show": "no_show",
  advance: "advance",
} as const satisfies Record<CancelReason, DbCancelReason>;

export function toDbCancelReason(reason: CancelReason): DbCancelReason {
  return TO_DB_REASON[reason];
}

export function fromDbCancelReason(reason: DbCancelReason): CancelReason {
  return reason === "no_show" ? "no-show" : "advance";
}
