import {
  AdminShiftListResponseSchema,
  AuditLogResponseSchema,
  ERROR_MESSAGES,
  TimesheetListResponseSchema,
  TimesheetSchema,
  type Timesheet,
} from "@repo/shared";
import {
  bearer,
  createTestApp,
  errorOf,
  loginAll,
  resetDatabase,
  type SeedUserId,
  type TestApp,
} from "./helpers.js";

describe("timesheets (e2e)", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;
  const as = (user: SeedUserId) => bearer(tokens[user]);
  const submit = (user: SeedUserId, body: object) =>
    t.http().post("/api/timesheets").set(as(user)).send(body);
  const approve = (user: SeedUserId, id: string) =>
    t.http().post(`/api/timesheets/${id}/approve`).set(as(user));
  const list = async (user: SeedUserId) =>
    TimesheetListResponseSchema.parse(
      (await t.http().get("/api/timesheets").set(as(user)).expect(200)).body,
    ).timesheets;

  /** nurse-1's timesheet on agency-a's shift-2, the seed's one filled shift. */
  async function submitShift2(
    actualStart = "07:00",
    actualEnd = "19:30",
  ): Promise<Timesheet> {
    const response = await submit("nurse-1", {
      shiftId: "shift-2",
      actualStart,
      actualEnd,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return TimesheetSchema.parse(response.body);
  }

  async function lastAudit() {
    const response = await t
      .http()
      .get("/api/admin/audit-log?limit=1")
      .set(as("admin-1"))
      .expect(200);
    return AuditLogResponseSchema.parse(response.body).entries[0];
  }

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t);
    tokens = await loginAll(t);
  });

  beforeEach(async () => {
    await resetDatabase(t);
  });

  afterEach(() => {
    t.clock.reset();
  });

  /** Agency A posts a shift and nurse-1 (valid to 2027-01-01) claims it. */
  async function claimedShift(
    date: string,
    startTime: string,
    endTime: string,
  ): Promise<string> {
    const posted = await t
      .http()
      .post("/api/shifts")
      .set(as("agency-a"))
      .send({ role: "RN", date, startTime, endTime })
      .expect(201);
    const { id } = posted.body as { id: string };
    await t
      .http()
      .post(`/api/shifts/${id}/claim`)
      .set(as("nurse-1"))
      .expect(200);
    return id;
  }

  afterAll(async () => {
    await t.close();
  });

  describe("POST /api/timesheets", () => {
    it("records the nurse's actual hours on her filled shift", async () => {
      const timesheet = await submitShift2();
      expect(timesheet).toMatchObject({
        shiftId: "shift-2",
        nurseId: "nurse-1",
        agencyId: "agency-a",
        date: "2026-10-03",
        actualStart: "07:00",
        actualEnd: "19:30",
        minutesWorked: 750,
        status: "submitted",
        approvedAt: null,
        approvedBy: null,
      });
      expect(await lastAudit()).toMatchObject({
        actorId: "nurse-1",
        action: "timesheet.submitted",
        entityType: "timesheet",
        entityId: timesheet.id,
        details: { shiftId: "shift-2", agencyId: "agency-a" },
      });
    });

    it("accepts hours for a shift that has ended", async () => {
      t.clock.set("2026-10-03T19:00:00Z");
      expect((await submitShift2()).shiftId).toBe("shift-2");
    });

    it("answers 409 to hours for a shift that hasn't ended", async () => {
      const shiftId = await claimedShift("2026-12-10", "07:00", "19:00");
      t.clock.set("2026-12-10T18:59:00Z");
      const response = await submit("nurse-1", {
        shiftId,
        actualStart: "07:00",
        actualEnd: "19:00",
      }).expect(409);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.timesheetBeforeShiftEnds);
      expect(await list("nurse-1")).toEqual([]);
    });

    it("blocks an overnight shift until its end time the next day", async () => {
      const shiftId = await claimedShift("2026-12-10", "19:00", "07:00");
      const body = { shiftId, actualStart: "19:00", actualEnd: "07:00" };
      for (const now of ["2026-12-10T23:00:00Z", "2026-12-11T06:59:00Z"]) {
        t.clock.set(now);
        const response = await submit("nurse-1", body).expect(409);
        expect(errorOf(response)).toBe(ERROR_MESSAGES.timesheetBeforeShiftEnds);
      }
      t.clock.set("2026-12-11T07:00:00Z");
      const response = await submit("nurse-1", body).expect(201);
      expect(TimesheetSchema.parse(response.body)).toMatchObject({
        shiftId,
        date: "2026-12-10",
        minutesWorked: 720,
      });
    });

    it("counts an overnight shift across midnight", async () => {
      expect((await submitShift2("19:00", "07:15")).minutesWorked).toBe(735);
    });

    it("ignores a nurseId in the body", async () => {
      const response = await submit("nurse-1", {
        shiftId: "shift-2",
        actualStart: "07:00",
        actualEnd: "19:00",
        nurseId: "nurse-2",
      }).expect(201);
      expect(TimesheetSchema.parse(response.body).nurseId).toBe("nurse-1");
    });

    it("answers 409 to a second timesheet for the same shift", async () => {
      await submitShift2();
      const response = await submit("nurse-1", {
        shiftId: "shift-2",
        actualStart: "07:00",
        actualEnd: "19:00",
      }).expect(409);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.timesheetExists);
    });

    it.each([
      ["another nurse's claim", "nurse-2", "shift-2"],
      ["an open shift", "nurse-1", "shift-1"],
    ] as const)("answers 403 for %s", async (_, user, shiftId) => {
      const response = await submit(user, {
        shiftId,
        actualStart: "07:00",
        actualEnd: "19:00",
      }).expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.timesheetNotYourShift);
    });

    it("answers 404 for an unknown shift", async () => {
      const response = await submit("nurse-1", {
        shiftId: "shift-999",
        actualStart: "07:00",
        actualEnd: "19:00",
      }).expect(404);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.shiftNotFound);
    });

    it.each([
      [
        "equal start and end",
        { shiftId: "shift-2", actualStart: "07:00", actualEnd: "07:00" },
      ],
      [
        "a bad time",
        { shiftId: "shift-2", actualStart: "7am", actualEnd: "19:00" },
      ],
      ["no shift", { actualStart: "07:00", actualEnd: "19:00" }],
    ])("answers 400 for %s", async (_, body) => {
      const response = await submit("nurse-1", body).expect(400);
      expect(errorOf(response)).toMatch(/actualStart|actualEnd|shiftId/);
    });

    it("blocks cancelling a claim that has a timesheet", async () => {
      await submitShift2();
      for (const user of ["agency-a", "admin-1"] as const) {
        const response = await t
          .http()
          .post("/api/shifts/shift-2/cancel")
          .set(as(user))
          .send({ reason: "no-show" })
          .expect(409);
        expect(errorOf(response)).toBe(ERROR_MESSAGES.shiftHasTimesheet);
      }
      const shifts = await t
        .http()
        .get("/api/admin/shifts")
        .set(as("admin-1"))
        .expect(200);
      expect(
        AdminShiftListResponseSchema.parse(shifts.body).shifts.find(
          (s) => s.id === "shift-2",
        ),
      ).toMatchObject({
        status: "filled",
        claimedBy: "nurse-1",
        cancellations: [],
        timesheetStatus: "submitted",
      });
    });
  });

  describe("GET /api/timesheets", () => {
    it("shows each role what it may see", async () => {
      const timesheet = await submitShift2();
      expect(await list("nurse-1")).toEqual([timesheet]);
      expect(await list("nurse-2")).toEqual([]);
      expect(await list("agency-a")).toEqual([timesheet]);
      expect(await list("agency-b")).toEqual([]);
      expect(await list("admin-1")).toEqual([timesheet]);
    });
  });

  describe("POST /api/timesheets/:id/approve", () => {
    it("lets the shift's agency approve it", async () => {
      const { id } = await submitShift2();
      const response = await approve("agency-a", id).expect(200);
      const approved = TimesheetSchema.parse(response.body);
      expect(approved).toMatchObject({
        id,
        status: "approved",
        approvedBy: "agency-a",
      });
      expect(approved.approvedAt).not.toBeNull();
      expect(await lastAudit()).toMatchObject({
        actorId: "agency-a",
        actorRole: "agency",
        action: "timesheet.approved",
        entityId: id,
        details: { shiftId: "shift-2", nurseId: "nurse-1" },
      });

      const shifts = await t
        .http()
        .get("/api/admin/shifts")
        .set(as("admin-1"))
        .expect(200);
      expect(
        AdminShiftListResponseSchema.parse(shifts.body).shifts.find(
          (s) => s.id === "shift-2",
        )?.timesheetStatus,
      ).toBe("approved");
    });

    it("answers 403 to another agency", async () => {
      const { id } = await submitShift2();
      const response = await approve("agency-b", id).expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.notYourAgency);
    });

    it("answers 409 when already approved", async () => {
      const { id } = await submitShift2();
      await approve("agency-a", id).expect(200);
      const response = await approve("agency-a", id).expect(409);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.timesheetAlreadyApproved);
    });

    it("answers 404 for an unknown timesheet", async () => {
      const response = await approve(
        "agency-a",
        "00000000-0000-4000-8000-0000000000ff",
      ).expect(404);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.timesheetNotFound);
    });
  });
});
