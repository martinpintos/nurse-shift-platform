import type { Shift } from "@repo/shared";
import {
  formatShiftDate,
  formatTimeRange,
  isOvernight,
  shiftLength,
} from "../lib/format";

export function shiftStatusTone(status: Shift["status"]) {
  if (status === "open") return "accent" as const;
  if (status === "filled") return "success" as const;
  return "danger" as const;
}

export function byDateAndTime(a: Shift, b: Shift): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

/** "RN shift shift-1 on Fri, Oct 2, 2026": spoken context for row-level buttons. */
export function shiftLabel(shift: Shift): string {
  return `${shift.role} shift ${shift.id} on ${formatShiftDate(shift.date)}`;
}

/** Date, time range and length of a shift, as used on cards and rows. */
export function ShiftWhen({ shift }: { shift: Shift }) {
  return (
    <div className="shift-when">
      <span className="shift-date">{formatShiftDate(shift.date)}</span>
      <span className="shift-time nums">
        {formatTimeRange(shift.startTime, shift.endTime)}
        <span className="muted">
          {" · "}
          {shiftLength(shift.startTime, shift.endTime)}
          {isOvernight(shift.startTime, shift.endTime) ? " · overnight" : ""}
        </span>
      </span>
    </div>
  );
}
