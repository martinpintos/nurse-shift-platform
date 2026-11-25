import { z } from "zod";
import { UserRoleSchema } from "./auth.js";
import { IdSchema } from "./primitives.js";
import { ShiftSchema } from "./shifts.js";

/**
 * Display names for ids, resolved when a response is read. Stored rows (and audit entries)
 * keep ids only; a response that shows people or shifts adds a `refs` side map keyed by the
 * ids it references. Never emails, credentials or health data.
 */
export const PersonRefSchema = z.strictObject({
  name: z.string().min(1),
  role: UserRoleSchema,
});
export type PersonRef = z.infer<typeof PersonRefSchema>;

/** What a sentence needs about a shift: "LPN at Sunrise Health Staffing on Sat, Oct 3". */
export const ShiftRefSchema = ShiftSchema.pick({
  agencyId: true,
  agencyName: true,
  role: true,
  date: true,
  startTime: true,
  endTime: true,
}).strict();
export type ShiftRef = z.infer<typeof ShiftRefSchema>;

export const PeopleRefsSchema = z.record(IdSchema, PersonRefSchema);
export type PeopleRefs = z.infer<typeof PeopleRefsSchema>;

export const RefsSchema = z.strictObject({
  /** User ids (nurses, agency logins, admins) to names. */
  people: PeopleRefsSchema,
  /** Shift ids to a short description of the shift. */
  shifts: z.record(IdSchema, ShiftRefSchema),
});
export type Refs = z.infer<typeof RefsSchema>;

/** A response with nothing to name. */
export const EMPTY_REFS: Refs = { people: {}, shifts: {} };

/**
 * GET /api/agencies/:agencyId/people 200 response: the nurses who hold or have held a
 * claim on the agency's shifts. The spec's agency route can't carry names, so this does.
 */
export const AgencyPeopleResponseSchema = z.strictObject({
  agencyId: IdSchema,
  people: PeopleRefsSchema,
});
export type AgencyPeopleResponse = z.infer<typeof AgencyPeopleResponseSchema>;
