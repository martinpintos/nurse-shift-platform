import { z } from "zod";

/** A real calendar date as `YYYY-MM-DD`. Past dates are valid (the seed shifts are in the past). */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Expected a real calendar date");

/**
 * A 24-hour, facility-local time as `HH:MM`. No timezone conversion (see the spec).
 * A shift's end time may be earlier than its start time: that is an overnight shift.
 */
export const Time24hSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour time as HH:MM");

export const IdSchema = z.string().min(1);
