/**
 * The required `data-testid` values from the spec, exactly as named. Put each on the
 * element that performs the action. `notificationBanner` is shared by success and error
 * banners; tell them apart by content.
 */
export const TEST_IDS = {
  loginEmailInput: "login-email-input",
  loginPasswordInput: "login-password-input",
  loginSubmitButton: "login-submit-button",
  shiftListItem: "shift-list-item",
  shiftClaimButton: "shift-claim-button",
  shiftCancelButton: "shift-cancel-button",
  credentialUploadInput: "credential-upload-input",
  credentialExpiryDateInput: "credential-expiry-date-input",
  agencyPostShiftButton: "agency-post-shift-button",
  agencyPostShiftSubmitButton: "agency-post-shift-submit-button",
  adminDashboardShiftTable: "admin-dashboard-shift-table",
  adminShiftStatusBadge: "admin-shift-status-badge",
  auditLogTable: "audit-log-table",
  timesheetTable: "timesheet-table",
  notificationBanner: "notification-banner",
} as const;

export type TestId = (typeof TEST_IDS)[keyof typeof TEST_IDS];
