import { z } from "zod";
import { IdSchema, IsoDateSchema, Time24hSchema } from "./primitives.js";
import { RefsSchema } from "./refs.js";

export const TimesheetStatusSchema = z.enum(["submitted", "approved"]);
export type TimesheetStatus = z.infer<typeof TimesheetStatusSchema>;

const MINUTES_PER_DAY = 24 * 60;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

/**
 * Minutes worked between two facility-local `HH:MM` times. An end time earlier than the
 * start time is an overnight shift (19:00 to 07:00 is 720 minutes).
 */
export function timesheetMinutes(
  actualStart: string,
  actualEnd: string,
): number {
  const diff = toMinutes(actualEnd) - toMinutes(actualStart);
  return diff > 0 ? diff : diff + MINUTES_PER_DAY;
}

/** The parts of a shift that say when it ends. */
export interface ShiftTimes {
  /** `YYYY-MM-DD`, facility-local. */
  date: string;
  /** `HH:MM`, facility-local. */
  startTime: string;
  /** `HH:MM`, facility-local; at or before `startTime` means the next day. */
  endTime: string;
}

/**
 * When a shift ends, as facility-local wall time held in a Date's UTC fields. The spec
 * has no time zones, so there is no conversion: `2026-10-02` 19:00 to 07:00 ends at
 * `2026-10-03T07:00Z`. An end at or before the start is the next day (overnight).
 */
export function shiftEndsAt(shift: ShiftTimes): Date {
  const end = new Date(`${shift.date}T${shift.endTime}:00.000Z`);
  if (toMinutes(shift.endTime) <= toMinutes(shift.startTime)) {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return end;
}

/**
 * Whether the shift has ended at `now`, read as facility wall time from its UTC fields
 * (the same no-conversion rule as `shiftEndsAt`). The end minute itself counts as ended.
 */
export function hasShiftEnded(shift: ShiftTimes, now: Date): boolean {
  return now.getTime() >= shiftEndsAt(shift).getTime();
}

/** POST /api/timesheets request: actual hours a nurse worked on her claimed shift. */
export const SubmitTimesheetRequestSchema = z
  .object({
    shiftId: IdSchema,
    actualStart: Time24hSchema,
    actualEnd: Time24hSchema,
  })
  .refine((body) => body.actualStart !== body.actualEnd, {
    message: "actualEnd must differ from actualStart",
    path: ["actualEnd"],
  });
export type SubmitTimesheetRequest = z.infer<
  typeof SubmitTimesheetRequestSchema
>;

export const TimesheetSchema = z.strictObject({
  id: IdSchema,
  shiftId: IdSchema,
  nurseId: IdSchema,
  agencyId: IdSchema,
  /** The shift's date. */
  date: IsoDateSchema,
  actualStart: Time24hSchema,
  actualEnd: Time24hSchema,
  minutesWorked: z.number().int().min(1).max(MINUTES_PER_DAY),
  status: TimesheetStatusSchema,
  submittedAt: z.iso.datetime(),
  approvedAt: z.iso.datetime().nullable(),
  approvedBy: IdSchema.nullable(),
});
export type Timesheet = z.infer<typeof TimesheetSchema>;

/** GET /api/timesheets 200 response: own (nurse), own shifts (agency), all (admin). */
export const TimesheetListResponseSchema = z.strictObject({
  timesheets: z.array(TimesheetSchema),
  /** Names for the nurses, approvers and shifts the timesheets reference. */
  refs: RefsSchema,
});
export type TimesheetListResponse = z.infer<typeof TimesheetListResponseSchema>;
