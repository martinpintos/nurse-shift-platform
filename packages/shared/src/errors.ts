import { z } from "zod";

/** Every error response, on every route: `{ "error": "<message>" }`. */
export const ErrorResponseSchema = z.strictObject({
  error: z.string().min(1),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Error messages, shared by the API, the web banner and the tests. The first two are
 * fixed word for word by the spec; the rest cover routes and cases beyond it.
 */
export const ERROR_MESSAGES = {
  // From docs/spec.md, word for word.
  invalidCredentials: "Invalid email or password",
  credentialExpired: "Credential expired, cannot claim shift",

  // 401 / 403 / 429
  authRequired: "Authentication required",
  invalidToken: "Invalid or expired token",
  forbidden: "You do not have permission to do that",
  notYourAgency: "You can only manage your own agency's shifts",
  notYourClaim: "You can only cancel your own claimed shifts",
  nurseCancelInAdvanceOnly: "Nurses can only cancel in advance",
  noCredential: "No credential on file, cannot claim shift",
  tooManyLoginAttempts: "Too many login attempts, try again later",

  // 404
  shiftNotFound: "Shift not found",
  credentialNotFound: "Credential not found",
  timesheetNotFound: "Timesheet not found",

  // 409
  shiftAlreadyFilled: "Shift already filled",
  shiftNotClaimed: "Shift is not claimed, cannot cancel",
  shiftHasTimesheet: "Shift has a timesheet, cannot cancel",
  timesheetExists: "A timesheet was already submitted for this shift",
  timesheetAlreadyApproved: "Timesheet already approved",
  timesheetBeforeShiftEnds: "You can submit hours after the shift ends",

  // 400 / 403 on uploads and timesheets
  credentialFileRequired: "A license file is required",
  credentialFileType: "File must be a PDF, PNG or JPEG",
  credentialFileTooLarge: "File must be 2 MB or smaller",
  timesheetNotYourShift:
    "You can only submit timesheets for your own claimed shifts",
} as const;
