import type {
  AdminShift,
  AuditLogEntry,
  Credential,
  MeResponse,
  OutboxMessage,
  Shift,
  Timesheet,
} from "@repo/shared";

export const nurse: MeResponse = {
  id: "nurse-1",
  name: "Maria Lopez",
  role: "nurse",
  agencyId: null,
};

export const agency: MeResponse = {
  id: "agency-a",
  name: "Sunrise Health Staffing",
  role: "agency",
  agencyId: "agency-a",
};

export const admin: MeResponse = {
  id: "admin-1",
  name: "Alex Kim",
  role: "admin",
  agencyId: null,
};

/** The spec's seed shifts. */
export const shift1: Shift = {
  id: "shift-1",
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "RN",
  date: "2026-10-02",
  startTime: "19:00",
  endTime: "07:00",
  status: "open",
  claimedBy: null,
};

export const shift2: Shift = {
  id: "shift-2",
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "LPN",
  date: "2026-10-03",
  startTime: "07:00",
  endTime: "19:00",
  status: "filled",
  claimedBy: "nurse-1",
};

export const shift3: Shift = {
  id: "shift-3",
  agencyId: "agency-b",
  agencyName: "Metro Care Partners",
  role: "RN",
  date: "2026-10-04",
  startTime: "19:00",
  endTime: "07:00",
  status: "open",
  claimedBy: null,
};

export const seedShifts: Shift[] = [shift1, shift2, shift3];

export const credential: Credential = {
  id: "cred-1",
  nurseId: "nurse-1",
  fileName: "rn-license.pdf",
  contentType: "application/pdf",
  sizeBytes: 48_213,
  expiresOn: "2027-01-01",
  uploadedAt: "2026-11-24T12:00:00.000Z",
  status: "valid",
};

export const submittedTimesheet: Timesheet = {
  id: "ts-1",
  shiftId: "shift-2",
  nurseId: "nurse-1",
  agencyId: "agency-a",
  date: "2026-10-03",
  actualStart: "07:00",
  actualEnd: "19:00",
  minutesWorked: 720,
  status: "submitted",
  submittedAt: "2026-11-24T12:00:00.000Z",
  approvedAt: null,
  approvedBy: null,
};

export function adminShift(
  shift: Shift,
  extra: Partial<AdminShift> = {},
): AdminShift {
  return { ...shift, cancellations: [], timesheetStatus: null, ...extra };
}

export const adminShifts: AdminShift[] = [
  adminShift(shift1, {
    cancellations: [
      {
        reason: "no-show",
        previousNurseId: "nurse-2",
        cancelledBy: "agency-a",
        cancelledByRole: "agency",
        cancelledAt: "2026-11-24T10:00:00.000Z",
      },
    ],
  }),
  adminShift(shift2, { timesheetStatus: "submitted" }),
  adminShift(shift3),
];

export const auditEntry: AuditLogEntry = {
  id: "audit-1",
  at: "2026-11-24T10:00:00.000Z",
  actorId: "agency-a",
  actorRole: "agency",
  action: "shift.cancelled",
  entityType: "shift",
  entityId: "shift-1",
  details: { reason: "no-show", previousNurseId: "nurse-2" },
};

export const outboxMessage: OutboxMessage = {
  id: "out-1",
  createdAt: "2026-11-24T10:00:00.000Z",
  template: "shift.cancelled",
  shiftId: "shift-1",
  recipientId: "nurse-2",
  recipientEmail: "james.cook@example.com",
  subject: "Your shift was cancelled",
  body: "Your RN shift on 2026-10-02 was released.",
};
