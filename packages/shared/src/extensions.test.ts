import { describe, expect, it } from "vitest";
import {
  AdminShiftListResponseSchema,
  AdminShiftSchema,
  AgencyPeopleResponseSchema,
  AuditLogEntrySchema,
  AuditLogResponseSchema,
  AuditLogQuerySchema,
  CredentialSchema,
  CredentialUploadFieldsSchema,
  ERROR_MESSAGES,
  MAX_CREDENTIAL_BYTES,
  MeResponseSchema,
  OutboxMessageSchema,
  OutboxResponseSchema,
  ROUTES,
  RefsSchema,
  ResetResponseSchema,
  SubmitTimesheetRequestSchema,
  TimesheetListResponseSchema,
  TimesheetSchema,
  routePath,
  timesheetMinutes,
  type AdminShift,
  type Credential,
  type Refs,
  type Timesheet,
} from "./index.js";

const credential: Credential = {
  id: "cred-1",
  nurseId: "nurse-1",
  fileName: "rn-license.pdf",
  contentType: "application/pdf",
  sizeBytes: 1234,
  expiresOn: "2027-01-01",
  uploadedAt: "2026-11-24T12:00:00.000Z",
  status: "valid",
};

const timesheet: Timesheet = {
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

const adminShift: AdminShift = {
  id: "shift-2",
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "LPN",
  date: "2026-10-03",
  startTime: "07:00",
  endTime: "19:00",
  status: "open",
  claimedBy: null,
  cancellations: [
    {
      reason: "no-show",
      previousNurseId: "nurse-1",
      cancelledBy: "agency-a",
      cancelledByRole: "agency",
      cancelledAt: "2026-11-24T12:00:00.000Z",
    },
  ],
  timesheetStatus: null,
};

describe("MeResponseSchema", () => {
  it("carries the agency for agency logins and null otherwise", () => {
    expect(
      MeResponseSchema.parse({
        id: "agency-a",
        name: "Sunrise Health Staffing",
        role: "agency",
        agencyId: "agency-a",
      }).agencyId,
    ).toBe("agency-a");
    expect(
      MeResponseSchema.safeParse({
        id: "nurse-1",
        name: "Maria Lopez",
        role: "nurse",
        agencyId: null,
      }).success,
    ).toBe(true);
  });
});

describe("credentials", () => {
  it("accepts a valid credential and rejects extra fields", () => {
    expect(CredentialSchema.parse(credential)).toEqual(credential);
    expect(
      CredentialSchema.safeParse({ ...credential, data: "base64..." }).success,
    ).toBe(false);
  });

  it("rejects types other than PDF, PNG and JPEG, and files over the limit", () => {
    expect(
      CredentialSchema.safeParse({
        ...credential,
        contentType: "image/svg+xml",
      }).success,
    ).toBe(false);
    expect(
      CredentialSchema.safeParse({
        ...credential,
        sizeBytes: MAX_CREDENTIAL_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it("accepts a past expiry date on upload (it is recorded as expired)", () => {
    expect(
      CredentialUploadFieldsSchema.safeParse({ expiresOn: "2026-06-01" })
        .success,
    ).toBe(true);
    expect(
      CredentialUploadFieldsSchema.safeParse({ expiresOn: "06/01/2026" })
        .success,
    ).toBe(false);
  });
});

describe("timesheets", () => {
  it.each([
    ["07:00", "19:00", 720],
    ["19:00", "07:00", 720],
    ["23:30", "00:15", 45],
    ["00:00", "23:59", 1439],
  ])("%s to %s is %i minutes", (start, end, minutes) => {
    expect(timesheetMinutes(start, end)).toBe(minutes);
  });

  it("rejects equal start and end times", () => {
    expect(
      SubmitTimesheetRequestSchema.safeParse({
        shiftId: "shift-2",
        actualStart: "07:00",
        actualEnd: "07:00",
      }).success,
    ).toBe(false);
  });

  it("strips unknown request keys such as nurseId", () => {
    const parsed = SubmitTimesheetRequestSchema.parse({
      shiftId: "shift-2",
      actualStart: "07:00",
      actualEnd: "19:00",
      nurseId: "nurse-2",
    });
    expect(parsed).not.toHaveProperty("nurseId");
  });

  it("parses a timesheet strictly", () => {
    expect(TimesheetSchema.parse(timesheet)).toEqual(timesheet);
    expect(TimesheetSchema.safeParse({ ...timesheet, hours: 12 }).success).toBe(
      false,
    );
  });
});

describe("admin", () => {
  it("parses an admin shift with cancellation history", () => {
    expect(AdminShiftSchema.parse(adminShift)).toEqual(adminShift);
  });

  it("keeps audit details to ids and scalars", () => {
    const entry = {
      id: "audit-1",
      at: "2026-11-24T12:00:00.000Z",
      actorId: "nurse-1",
      actorRole: "nurse",
      action: "shift.claimed",
      entityType: "shift",
      entityId: "shift-1",
      details: { agencyId: "agency-a" },
    };
    expect(AuditLogEntrySchema.parse(entry)).toEqual(entry);
    expect(
      AuditLogEntrySchema.safeParse({
        ...entry,
        details: { nurse: { name: "Maria Lopez" } },
      }).success,
    ).toBe(false);
  });

  it("defaults the audit log limit and caps it", () => {
    expect(AuditLogQuerySchema.parse({})).toEqual({ limit: 100 });
    expect(AuditLogQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 });
    expect(AuditLogQuerySchema.safeParse({ limit: "5000" }).success).toBe(
      false,
    );
  });

  it("parses outbox messages and the reset response", () => {
    expect(
      OutboxMessageSchema.safeParse({
        id: "msg-1",
        createdAt: "2026-11-24T12:00:00.000Z",
        template: "shift.claimed",
        shiftId: "shift-1",
        recipientId: "agency-a",
        recipientEmail: "admin@sunrisehealth.example",
        subject: "Shift shift-1 was claimed",
        body: "nurse-1 claimed shift-1 on 2026-10-02, 19:00 to 07:00.",
      }).success,
    ).toBe(true);
    expect(ResetResponseSchema.parse({ status: "reset" })).toEqual({
      status: "reset",
    });
  });
});

const refs: Refs = {
  people: {
    "nurse-1": { name: "Maria Lopez", role: "nurse" },
    "agency-a": { name: "Sunrise Health Staffing", role: "agency" },
  },
  shifts: {
    "shift-2": {
      agencyId: "agency-a",
      agencyName: "Sunrise Health Staffing",
      role: "LPN",
      date: "2026-10-03",
      startTime: "07:00",
      endTime: "19:00",
    },
  },
};

describe("refs", () => {
  it("parses names for people and shifts", () => {
    expect(RefsSchema.parse(refs)).toEqual(refs);
  });

  it("refuses anything beyond a name and role for a person", () => {
    expect(
      RefsSchema.safeParse({
        ...refs,
        people: {
          "nurse-1": {
            name: "Maria Lopez",
            role: "nurse",
            email: "maria.lopez@example.com",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("refuses extra shift fields, such as who claimed it", () => {
    expect(
      RefsSchema.safeParse({
        ...refs,
        shifts: {
          "shift-2": { ...refs.shifts["shift-2"], claimedBy: "nurse-1" },
        },
      }).success,
    ).toBe(false);
  });

  it("requires refs on every response that shows names", () => {
    const withoutRefs = [
      [AdminShiftListResponseSchema, { shifts: [adminShift] }],
      [AuditLogResponseSchema, { entries: [] }],
      [OutboxResponseSchema, { messages: [] }],
      [TimesheetListResponseSchema, { timesheets: [timesheet] }],
    ] as const;
    for (const [schema, body] of withoutRefs) {
      expect(schema.safeParse(body).success).toBe(false);
      expect(schema.safeParse({ ...body, refs }).success).toBe(true);
    }
  });

  it("parses the agency people lookup", () => {
    const body = {
      agencyId: "agency-a",
      people: { "nurse-1": refs.people["nurse-1"] },
    };
    expect(AgencyPeopleResponseSchema.parse(body)).toEqual(body);
    expect(
      AgencyPeopleResponseSchema.safeParse({ ...body, shifts: {} }).success,
    ).toBe(false);
  });
});

describe("ROUTES", () => {
  it("has no duplicate method and path pairs", () => {
    const keys = ROUTES.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps admin routes admin-only", () => {
    for (const route of ROUTES.filter((r) =>
      r.path.startsWith("/api/admin/"),
    )) {
      expect(route.access).toEqual(["admin"]);
    }
  });

  it("fills and encodes route params", () => {
    expect(routePath("/api/shifts/:id/claim", { id: "shift-1" })).toBe(
      "/api/shifts/shift-1/claim",
    );
    expect(
      routePath("/api/agencies/:agencyId/shifts", { agencyId: "a/b" }),
    ).toBe("/api/agencies/a%2Fb/shifts");
    expect(() => routePath("/api/shifts/:id/claim")).toThrow(/id/);
  });
});

describe("ERROR_MESSAGES", () => {
  it("has no duplicate messages", () => {
    const messages = Object.values(ERROR_MESSAGES);
    expect(new Set(messages).size).toBe(messages.length);
  });
});
