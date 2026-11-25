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
