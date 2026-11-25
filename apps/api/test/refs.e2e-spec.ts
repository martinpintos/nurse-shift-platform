import {
  AdminShiftListResponseSchema,
  AgencyPeopleResponseSchema,
  AuditLogResponseSchema,
  ERROR_MESSAGES,
  OutboxResponseSchema,
  TimesheetListResponseSchema,
  TimesheetSchema,
  type Refs,
  type ShiftRef,
} from "@repo/shared";
import {
  SAMPLE_FILES,
  bearer,
  createTestApp,
  errorOf,
  loginAll,
  resetDatabase,
  uploadCredential,
  type SeedUserId,
  type TestApp,
} from "./helpers.js";

const MARIA = { name: "Maria Lopez", role: "nurse" } as const;
const JAMES = { name: "James Cook", role: "nurse" } as const;
const SUNRISE = { name: "Sunrise Health Staffing", role: "agency" } as const;
const ALEX = { name: "Alex Kim", role: "admin" } as const;

const SHIFT_1_REF: ShiftRef = {
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "RN",
  date: "2026-10-02",
  startTime: "19:00",
  endTime: "07:00",
};
const SHIFT_2_REF: ShiftRef = {
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "LPN",
  date: "2026-10-03",
  startTime: "07:00",
  endTime: "19:00",
};
const SHIFT_3_REF: ShiftRef = {
  agencyId: "agency-b",
  agencyName: "Metro Care Partners",
  role: "RN",
  date: "2026-10-04",
  startTime: "19:00",
  endTime: "07:00",
};

/** Every string anywhere in a value: the ids (and everything else) a response mentions. */
function stringsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, into);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value)) stringsIn(v, into);
  }
  return into;
}

/** refs only names ids the rest of the response references, and never carries an email. */
function expectRefsScoped(body: Record<string, unknown>, refs: Refs): void {
  const { refs: _refs, ...rest } = body;
  const referenced = stringsIn(rest);
  for (const id of [...Object.keys(refs.people), ...Object.keys(refs.shifts)]) {
    expect(referenced, `refs key ${id} is not referenced`).toContain(id);
  }
  expect(JSON.stringify(refs)).not.toContain("@");
}

describe("refs (e2e)", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;
  const as = (user: SeedUserId) => bearer(tokens[user]);

  const get = async (path: string, user: SeedUserId) =>
    (await t.http().get(path).set(as(user)).expect(200)).body as Record<
      string,
      unknown
    >;

  const cancelShift2NoShow = () =>
    t
      .http()
      .post("/api/shifts/shift-2/cancel")
      .set(as("agency-a"))
      .send({ reason: "no-show" })
      .expect(200);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t);
    tokens = await loginAll(t);
  });

  beforeEach(async () => {
    await resetDatabase(t);
  });

  afterAll(async () => {
    await t.close();
  });

  describe("GET /api/admin/shifts", () => {
    it("names the claiming nurse on the seed", async () => {
      const body = await get("/api/admin/shifts", "admin-1");
      const { refs } = AdminShiftListResponseSchema.parse(body);
      expect(refs).toEqual({ people: { "nurse-1": MARIA }, shifts: {} });
      expectRefsScoped(body, refs);
    });

    it("names the previous nurse and who cancelled", async () => {
      await cancelShift2NoShow();
      const body = await get("/api/admin/shifts", "admin-1");
      const { refs } = AdminShiftListResponseSchema.parse(body);
      expect(refs.people).toEqual({ "nurse-1": MARIA, "agency-a": SUNRISE });
      expectRefsScoped(body, refs);
    });
  });

  describe("GET /api/admin/audit-log", () => {
    it("names the actor and nurse of a no-show cancel, and describes the shift", async () => {
      await cancelShift2NoShow();
      const body = await get("/api/admin/audit-log", "admin-1");
      const { entries, refs } = AuditLogResponseSchema.parse(body);
      expect(entries[0]).toMatchObject({
        action: "shift.cancelled",
        actorId: "agency-a",
        entityId: "shift-2",
        details: { previousNurseId: "nurse-1" },
      });
      expect(refs).toEqual({
        people: { "agency-a": SUNRISE, "nurse-1": MARIA },
        shifts: { "shift-2": SHIFT_2_REF },
      });
      expectRefsScoped(body, refs);
    });

    it("names only the admin after a reset, the log's one entry", async () => {
      await cancelShift2NoShow();
      await t.http().post("/api/admin/reset").set(as("admin-1")).expect(200);
      const body = await get("/api/admin/audit-log", "admin-1");
      expect(AuditLogResponseSchema.parse(body).refs).toEqual({
        people: { "admin-1": ALEX },
        shifts: {},
      });
    });

    it("names the nurse and shift of timesheet entries", async () => {
      const submitted = await t
        .http()
        .post("/api/timesheets")
        .set(as("nurse-1"))
        .send({ shiftId: "shift-2", actualStart: "07:00", actualEnd: "19:00" })
        .expect(201);
      await t
        .http()
        .post(
          `/api/timesheets/${TimesheetSchema.parse(submitted.body).id}/approve`,
        )
        .set(as("agency-a"))
        .expect(200);
      const body = await get("/api/admin/audit-log", "admin-1");
      const { entries, refs } = AuditLogResponseSchema.parse(body);
      expect(entries.map((e) => e.entityType)).toEqual([
        "timesheet",
        "timesheet",
      ]);
      expect(refs).toEqual({
        people: { "nurse-1": MARIA, "agency-a": SUNRISE },
        shifts: { "shift-2": SHIFT_2_REF },
      });
      expectRefsScoped(body, refs);
    });
  });

  describe("GET /api/admin/outbox", () => {
    it("names the recipients and describes the shift", async () => {
      await t
        .http()
        .post("/api/shifts/shift-1/claim")
        .set(as("nurse-1"))
        .expect(200);
      const body = await get("/api/admin/outbox", "admin-1");
      const { messages, refs } = OutboxResponseSchema.parse(body);
      expect(new Set(messages.map((m) => m.recipientId))).toEqual(
        new Set(["nurse-1", "agency-a"]),
      );
      expect(refs).toEqual({
        people: { "nurse-1": MARIA, "agency-a": SUNRISE },
        shifts: { "shift-1": SHIFT_1_REF },
      });
      expectRefsScoped(body, refs);
    });

    it("is empty on the seed", async () => {
      const body = await get("/api/admin/outbox", "admin-1");
      expect(OutboxResponseSchema.parse(body).refs).toEqual({
        people: {},
        shifts: {},
      });
    });
  });

  describe("GET /api/timesheets", () => {
    /** nurse-1 on agency-a's shift-2 (approved by agency-a), nurse-2 on agency-b's shift-3. */
    async function twoAgenciesOfTimesheets(): Promise<void> {
      const first = await t
        .http()
        .post("/api/timesheets")
        .set(as("nurse-1"))
        .send({ shiftId: "shift-2", actualStart: "07:00", actualEnd: "19:00" })
        .expect(201);
      await t
        .http()
        .post(`/api/timesheets/${TimesheetSchema.parse(first.body).id}/approve`)
        .set(as("agency-a"))
        .expect(200);
      await uploadCredential(
        t,
        tokens["nurse-2"],
        SAMPLE_FILES.pdf,
        "license.pdf",
        "2027-12-31",
      ).expect(201);
      await t
        .http()
        .post("/api/shifts/shift-3/claim")
        .set(as("nurse-2"))
        .expect(200);
      await t
        .http()
        .post("/api/timesheets")
        .set(as("nurse-2"))
        .send({ shiftId: "shift-3", actualStart: "19:00", actualEnd: "07:00" })
        .expect(201);
    }

    const refsFor = async (user: SeedUserId) => {
      const body = await get("/api/timesheets", user);
      const { refs } = TimesheetListResponseSchema.parse(body);
      expectRefsScoped(body, refs);
      return refs;
    };

    it("names nurses, approvers and shifts within each role's own timesheets", async () => {
      await twoAgenciesOfTimesheets();
      expect(await refsFor("admin-1")).toEqual({
        people: { "nurse-1": MARIA, "agency-a": SUNRISE, "nurse-2": JAMES },
        shifts: { "shift-2": SHIFT_2_REF, "shift-3": SHIFT_3_REF },
      });
      expect(await refsFor("agency-a")).toEqual({
        people: { "nurse-1": MARIA, "agency-a": SUNRISE },
        shifts: { "shift-2": SHIFT_2_REF },
      });
      expect(await refsFor("agency-b")).toEqual({
        people: { "nurse-2": JAMES },
        shifts: { "shift-3": SHIFT_3_REF },
      });
      expect(await refsFor("nurse-1")).toEqual({
        people: { "nurse-1": MARIA, "agency-a": SUNRISE },
        shifts: { "shift-2": SHIFT_2_REF },
      });
      expect(await refsFor("nurse-2")).toEqual({
        people: { "nurse-2": JAMES },
        shifts: { "shift-3": SHIFT_3_REF },
      });
    });
  });

  describe("GET /api/agencies/:agencyId/people", () => {
    const people = async (agencyId: string, user: SeedUserId) =>
      AgencyPeopleResponseSchema.parse(
        await get(`/api/agencies/${agencyId}/people`, user),
      );

    it("lists the nurse holding a claim on the agency's shifts", async () => {
      expect(await people("agency-a", "agency-a")).toEqual({
        agencyId: "agency-a",
        people: { "nurse-1": MARIA },
      });
    });

    it("keeps a nurse whose claim was cancelled (history)", async () => {
      await cancelShift2NoShow();
      expect(await people("agency-a", "agency-a")).toEqual({
        agencyId: "agency-a",
        people: { "nurse-1": MARIA },
      });
    });

    it("is empty for an agency nobody has claimed from", async () => {
      expect(await people("agency-b", "agency-b")).toEqual({
        agencyId: "agency-b",
        people: {},
      });
    });

    it("refuses another agency's people", async () => {
      const response = await t
        .http()
        .get("/api/agencies/agency-b/people")
        .set(as("agency-a"))
        .expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.notYourAgency);
    });

    it("refuses a nurse", async () => {
      const response = await t
        .http()
        .get("/api/agencies/agency-a/people")
        .set(as("nurse-1"))
        .expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.forbidden);
    });

    it("lets the admin ask for any agency, and answers {} for an unknown one", async () => {
      expect(await people("agency-a", "admin-1")).toEqual({
        agencyId: "agency-a",
        people: { "nurse-1": MARIA },
      });
      expect(await people("agency-b", "admin-1")).toEqual({
        agencyId: "agency-b",
        people: {},
      });
      expect(await people("agency-zzz", "admin-1")).toEqual({
        agencyId: "agency-zzz",
        people: {},
      });
    });
  });
});
