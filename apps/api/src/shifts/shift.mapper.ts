import type { Shift } from "@repo/shared";
import type { Agency, Shift as ShiftRow } from "../generated/prisma/client.js";

/**
 * Formats a Postgres DATE as `YYYY-MM-DD`. Prisma returns `@db.Date` as a JS Date at UTC
 * midnight, so the date must be read in UTC: local-time getters would shift it a day
 * back anywhere west of UTC.
 */
export function formatDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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
