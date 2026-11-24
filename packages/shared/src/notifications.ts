/**
 * Success messages for the `notification-banner`. Errors show the API's `{ error }`
 * message verbatim (see ERROR_MESSAGES), in the same banner.
 */
export const SUCCESS_MESSAGES = {
  shiftClaimed: "Shift claimed",
  shiftCancelled: "Shift cancelled",
  shiftPosted: "Shift posted",
  credentialUploaded: "Credential uploaded",
  timesheetSubmitted: "Timesheet submitted",
  timesheetApproved: "Timesheet approved",
  demoDataReset: "Demo data reset",
  licensesExported: "License export downloaded",
} as const;
