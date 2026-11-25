import type { Shift } from "@repo/shared";
import {
  formatHours,
  formatShiftDate,
  formatTimeRange,
  isOvernight,
  shiftEndDate,
  shiftLength,
} from "../lib/format";

/** The plain shift from an action's response (the cancel response adds `cancellation`). */
export function toShift(shift: Shift): Shift {
  return {
    id: shift.id,
    agencyId: shift.agencyId,
    agencyName: shift.agencyName,
    role: shift.role,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    status: shift.status,
    claimedBy: shift.claimedBy,
  };
}

/** Replaces one shift in a list with the version an action returned. */
export function replaceShift<T extends Shift>(
  shifts: readonly T[],
  updated: Shift,
  merge: (previous: T, next: Shift) => T = (_previous, next) => next as T,
): T[] {
  return shifts.map((shift) =>
    shift.id === updated.id ? merge(shift, toShift(updated)) : shift,
  );
}

export function byDateAndTime(
  a: Pick<Shift, "date" | "startTime">,
  b: Pick<Shift, "date" | "startTime">,
): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

/** Spoken context for row-level actions. */
export function shiftLabel(shift: Shift): string {
  return `${shift.role} shift at ${shift.agencyName} on ${formatShiftDate(shift.date)}, ${formatTimeRange(shift.startTime, shift.endTime)}`;
}

/** The end date for an overnight shift, or the scheduled duration for a day shift. */
export function shiftEndNote(
  shift: Pick<Shift, "date" | "startTime" | "endTime">,
): string {
  return isOvernight(shift.startTime, shift.endTime)
    ? `Ends ${formatShiftDate(shiftEndDate(shift.date, shift.startTime, shift.endTime))}`
    : shiftLength(shift.startTime, shift.endTime);
}

/** The scheduled hours with their duration available on hover. */
export function ShiftHours({
  shift,
}: {
  shift: Pick<Shift, "startTime" | "endTime">;
}) {
  return (
    <span className="nums" title={shiftLength(shift.startTime, shift.endTime)}>
      {formatHours(shift.startTime, shift.endTime)}
    </span>
  );
}
