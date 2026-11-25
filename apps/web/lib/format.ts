import {
  timesheetMinutes,
  type AuditAction,
  type CancelReason,
} from "@repo/shared";

const LOCALE = "en-US";

// Shift dates are calendar dates, facility-local. Format them in UTC so 2026-10-02 never
// shows as the 1st west of UTC.
const shiftDateFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const plainDateFormat = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

// Timestamps (uploads, audit entries) are real instants: show them in the viewer's zone.
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function utcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day));
}

/** `2026-10-02` → `Fri, Oct 2, 2026`. */
export function formatShiftDate(isoDate: string): string {
  return shiftDateFormat.format(utcDate(isoDate));
}

/** `2027-01-01` → `Jan 1, 2027`. */
export function formatPlainDate(isoDate: string): string {
  return plainDateFormat.format(utcDate(isoDate));
}

export function formatDateTime(isoDateTime: string): string {
  return dateTimeFormat.format(new Date(isoDateTime));
}

export function formatClockTime(date: Date): string {
  return timeFormat.format(date);
}

/** An end time before the start time is an overnight shift. */
export function isOvernight(startTime: string, endTime: string): boolean {
  return endTime < startTime;
}

/** `19:00`, `07:00` → `19:00–07:00`. Times are 24-hour, facility-local. */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

/** 720 → `12 h`, 690 → `11 h 30 min`. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function shiftLength(startTime: string, endTime: string): string {
  return formatMinutes(timesheetMinutes(startTime, endTime));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

/** A local calendar date as `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function tomorrowIsoDate(now: Date = new Date()): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toIsoDate(tomorrow);
}

export const CANCEL_REASON_LABEL = {
  "no-show": "No-show",
  advance: "In advance",
} as const satisfies Record<CancelReason, string>;

export const AUDIT_ACTION_LABEL = {
  "shift.posted": "Shift posted",
  "shift.claimed": "Shift claimed",
  "shift.cancelled": "Shift cancelled",
  "credential.uploaded": "Credential uploaded",
  "timesheet.submitted": "Timesheet submitted",
  "timesheet.approved": "Timesheet approved",
  "admin.reset": "Demo data reset",
  "licenses.exported": "Licenses exported",
} as const satisfies Record<AuditAction, string>;
