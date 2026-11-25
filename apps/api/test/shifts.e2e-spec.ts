import {
  AdminShiftListResponseSchema,
  AgencyShiftListResponseSchema,
  AuditLogResponseSchema,
  CancelShiftResponseSchema,
  ERROR_MESSAGES,
  OutboxResponseSchema,
  ShiftListResponseSchema,
  ShiftSchema,
  type CancelReason,
  type Shift,
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

const SHIFT_1: Shift = {
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
const SHIFT_2: Shift = {
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
const SHIFT_3: Shift = {
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

describe("shifts (e2e)", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;

  const as = (user: SeedUserId) => bearer(tokens[user]);
  const claim = (user: SeedUserId, shiftId: string) =>
    t.http().post(`/api/shifts/${shiftId}/claim`).set(as(user));
  const cancel = (user: SeedUserId, shiftId: string, reason: CancelReason) =>
    t
      .http()
      .post(`/api/shifts/${shiftId}/cancel`)
      .set(as(user))
      .send({ reason });
  const post = (user: SeedUserId, body: object) =>
    t.http().post("/api/shifts").set(as(user)).send(body);

  async function auditEntries() {
    const response = await t
      .http()
      .get("/api/admin/audit-log?limit=500")
      .set(as("admin-1"))
      .expect(200);
    return AuditLogResponseSchema.parse(response.body).entries;
  }

  async function outbox() {
    const response = await t
      .http()
      .get("/api/admin/outbox")
      .set(as("admin-1"))
      .expect(200);
    return OutboxResponseSchema.parse(response.body).messages;
  }

  async function shift(id: string): Promise<Shift | undefined> {
    const response = await t
      .http()
      .get("/api/shifts")
      .set(as("admin-1"))
      .expect(200);
    return ShiftListResponseSchema.parse(response.body).shifts.find(
      (s) => s.id === id,
    );
  }

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

  describe("GET /api/shifts", () => {
    it.each(["nurse-1", "agency-b", "admin-1"] as const)(
      "lists the seeded shifts across agencies for %s, by date then id",
      async (user) => {
        const response = await t
          .http()
          .get("/api/shifts")
          .set(as(user))
          .expect(200);
        expect(ShiftListResponseSchema.parse(response.body)).toEqual({
          shifts: [SHIFT_1, SHIFT_2, SHIFT_3],
        });
      },
    );

    it("orders by date, then numeric id (shift-10 after shift-9)", async () => {
      for (let i = 0; i < 8; i++) {
        await post("agency-a", {
          role: "RN",
          date: "2026-10-02",
          startTime: "07:00",
          endTime: "19:00",
        }).expect(201);
      }
      await post("agency-b", {
        role: "LPN",
        date: "2026-09-30",
        startTime: "07:00",
        endTime: "19:00",
      }).expect(201);
      const response = await t
        .http()
        .get("/api/shifts")
        .set(as("nurse-1"))
        .expect(200);
      expect(
        ShiftListResponseSchema.parse(response.body).shifts.map((s) => s.id),
      ).toEqual([
        "shift-12",
        "shift-1",
        "shift-4",
        "shift-5",
        "shift-6",
        "shift-7",
        "shift-8",
        "shift-9",
        "shift-10",
        "shift-11",
        "shift-2",
        "shift-3",
      ]);
    });
  });

  describe("POST /api/shifts", () => {
    const body = {
      role: "RN",
      date: "2026-10-05",
      startTime: "07:00",
      endTime: "19:00",
    };

    it("posts an open shift for the agency in the token, as shift-4", async () => {
      const response = await post("agency-a", body).expect(201);
      expect(ShiftSchema.parse(response.body)).toEqual({
        id: "shift-4",
        agencyId: "agency-a",
        agencyName: "Sunrise Health Staffing",
        role: "RN",
        date: "2026-10-05",
        startTime: "07:00",
        endTime: "19:00",
        status: "open",
        claimedBy: null,
      });
      const [entry] = await auditEntries();
      expect(entry).toMatchObject({
        actorId: "agency-a",
        actorRole: "agency",
        action: "shift.posted",
        entityType: "shift",
        entityId: "shift-4",
        details: { agencyId: "agency-a", role: "RN" },
      });
    });

    it("ignores an agencyId in the body", async () => {
      const response = await post("agency-b", {
        ...body,
        agencyId: "agency-a",
      }).expect(201);
      expect(ShiftSchema.parse(response.body)).toMatchObject({
        agencyId: "agency-b",
        agencyName: "Metro Care Partners",
      });
    });

    it("accepts past dates and overnight times", async () => {
      const response = await post("agency-a", {
        role: "LPN",
        date: "2025-01-01",
        startTime: "23:00",
        endTime: "07:00",
      }).expect(201);
      expect(ShiftSchema.parse(response.body)).toMatchObject({
        date: "2025-01-01",
        startTime: "23:00",
        endTime: "07:00",
      });
    });

    it.each([
      ["an unknown role", { ...body, role: "CNA" }],
      ["an impossible date", { ...body, date: "2026-02-30" }],
      ["a date in another format", { ...body, date: "10/05/2026" }],
      ["a 25:00 start", { ...body, startTime: "25:00" }],
      ["a time without a leading zero", { ...body, endTime: "7:00" }],
      [
        "a missing field",
        { role: "RN", date: "2026-10-05", startTime: "07:00" },
      ],
    ])("answers 400 for %s, naming the field", async (_, invalid) => {
      const response = await post("agency-a", invalid).expect(400);
      expect(errorOf(response)).toMatch(/role|date|startTime|endTime/);
    });
  });

  describe("POST /api/shifts/:id/claim", () => {
    it("lets Maria Lopez claim shift-1: the spec's response", async () => {
      const response = await claim("nurse-1", "shift-1").expect(200);
      expect(ShiftSchema.parse(response.body)).toEqual({
        ...SHIFT_1,
        status: "filled",
        claimedBy: "nurse-1",
      });
      expect(await shift("shift-1")).toMatchObject({
        status: "filled",
        claimedBy: "nurse-1",
      });
    });

    it("writes a shift.claimed audit entry and notifies the agency and the nurse", async () => {
      await claim("nurse-1", "shift-1").expect(200);
      const [entry] = await auditEntries();
      expect(entry).toMatchObject({
        actorId: "nurse-1",
        actorRole: "nurse",
        action: "shift.claimed",
        entityType: "shift",
        entityId: "shift-1",
        details: { agencyId: "agency-a" },
      });
      const messages = await outbox();
      expect(messages).toHaveLength(2);
      expect(
        messages.map((m) => [
          m.template,
          m.shiftId,
          m.recipientId,
          m.recipientEmail,
        ]),
      ).toEqual(
        expect.arrayContaining([
          [
            "shift.claimed",
            "shift-1",
            "agency-a",
            "admin@sunrisehealth.example",
          ],
          ["shift.claimed", "shift-1", "nurse-1", "maria.lopez@example.com"],
        ]),
      );
    });

    it("refuses James Cook (expired credential) with the spec's 403", async () => {
      const response = await claim("nurse-2", "shift-1").expect(403);
      expect(response.body).toEqual({
        error: "Credential expired, cannot claim shift",
      });
      expect(await shift("shift-1")).toEqual(SHIFT_1);
      expect(await outbox()).toEqual([]);
    });

    it("answers 403 when the nurse has no credential at all", async () => {
      await t.prisma.credential.deleteMany({ where: { nurseId: "nurse-2" } });
      const response = await claim("nurse-2", "shift-1").expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.noCredential);
    });

    it("checks the credential against the shift date, not today", async () => {
      // Expires on shift-1's date, both long past: valid for shift-1, not for shift-3.
      await uploadCredential(
        t,
        tokens["nurse-2"],
        SAMPLE_FILES.pdf,
        "l.pdf",
        "2026-10-02",
      ).expect(201);
      await claim("nurse-2", "shift-1").expect(200);
      const response = await claim("nurse-2", "shift-3").expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.credentialExpired);
    });

    it("uses the nurse's latest credential", async () => {
      await uploadCredential(
        t,
        tokens["nurse-2"],
        SAMPLE_FILES.png,
        "new.png",
        "2027-12-31",
      ).expect(201);
      await claim("nurse-2", "shift-3").expect(200);
    });

    it("answers 409 for a filled shift", async () => {
      const response = await claim("nurse-1", "shift-2").expect(409);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.shiftAlreadyFilled);
    });

    it("answers 404 for an unknown shift", async () => {
      const response = await claim("nurse-1", "shift-999").expect(404);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.shiftNotFound);
    });

    it("lets exactly one of two concurrent claims win", async () => {
      await uploadCredential(
        t,
        tokens["nurse-2"],
        SAMPLE_FILES.pdf,
        "l.pdf",
        "2027-12-31",
      ).expect(201);
      const responses = await Promise.all([
        claim("nurse-1", "shift-1"),
        claim("nurse-2", "shift-1"),
      ]);
      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const loser = responses.find((r) => r.status === 409);
      expect(loser && errorOf(loser)).toBe(ERROR_MESSAGES.shiftAlreadyFilled);
      const winner = ShiftSchema.parse(
        responses.find((r) => r.status === 200)?.body,
      );
      expect(await shift("shift-1")).toEqual(winner);

      const claims = (await auditEntries()).filter(
        (e) => e.action === "shift.claimed" && e.entityId === "shift-1",
      );
      expect(claims).toHaveLength(1);
      expect(claims[0]?.actorId).toBe(winner.claimedBy);
      expect(
        (await outbox()).filter((m) => m.template === "shift.claimed"),
      ).toHaveLength(2);
    });
  });

  describe("POST /api/shifts/:id/cancel", () => {
    it("reopens shift-2 on an agency no-show report: the spec's response", async () => {
      const response = await cancel("agency-a", "shift-2", "no-show").expect(
        200,
      );
      expect(CancelShiftResponseSchema.parse(response.body)).toEqual({
        ...SHIFT_2,
        status: "open",
        claimedBy: null,
        cancellation: { reason: "no-show", previousNurseId: "nurse-1" },
      });
      expect(await shift("shift-2")).toMatchObject({
        status: "open",
        claimedBy: null,
      });
    });

    it("writes a shift.cancelled audit entry and notifies the nurse and the agency", async () => {
      await cancel("agency-a", "shift-2", "no-show").expect(200);
      const [entry] = await auditEntries();
      expect(entry).toMatchObject({
        actorId: "agency-a",
        actorRole: "agency",
        action: "shift.cancelled",
        entityType: "shift",
        entityId: "shift-2",
        details: {
          agencyId: "agency-a",
          reason: "no-show",
          previousNurseId: "nurse-1",
        },
      });
      const messages = await outbox();
      expect(
        messages.map((m) => [m.template, m.recipientId, m.recipientEmail]),
      ).toEqual(
        expect.arrayContaining([
          ["shift.cancelled", "nurse-1", "maria.lopez@example.com"],
          ["shift.cancelled", "agency-a", "admin@sunrisehealth.example"],
        ]),
      );
      expect(messages).toHaveLength(2);
    });

    it("keeps the cancellation history, newest first, in /api/admin/shifts", async () => {
      await cancel("agency-a", "shift-2", "no-show").expect(200);
      await claim("nurse-1", "shift-2").expect(200);
      await cancel("nurse-1", "shift-2", "advance").expect(200);

      const response = await t
        .http()
        .get("/api/admin/shifts")
        .set(as("admin-1"))
        .expect(200);
      const shift2 = AdminShiftListResponseSchema.parse(
        response.body,
      ).shifts.find((s) => s.id === "shift-2");
      expect(shift2).toMatchObject({
        status: "open",
        claimedBy: null,
        timesheetStatus: null,
      });
      expect(
        shift2?.cancellations.map(
          ({ reason, previousNurseId, cancelledBy, cancelledByRole }) => ({
            reason,
            previousNurseId,
            cancelledBy,
            cancelledByRole,
          }),
        ),
      ).toEqual([
        {
          reason: "advance",
          previousNurseId: "nurse-1",
          cancelledBy: "nurse-1",
          cancelledByRole: "nurse",
        },
        {
          reason: "no-show",
          previousNurseId: "nurse-1",
          cancelledBy: "agency-a",
          cancelledByRole: "agency",
        },
      ]);
    });

    // Who may cancel nurse-1's claim on agency-a's shift-2, for which reason.
    it.each([
      ["nurse-1", "advance", 200, null],
      ["nurse-1", "no-show", 403, ERROR_MESSAGES.nurseCancelInAdvanceOnly],
      ["nurse-2", "advance", 403, ERROR_MESSAGES.notYourClaim],
      ["nurse-2", "no-show", 403, ERROR_MESSAGES.notYourClaim],
      ["agency-a", "advance", 200, null],
      ["agency-a", "no-show", 200, null],
      ["agency-b", "advance", 403, ERROR_MESSAGES.notYourAgency],
      ["agency-b", "no-show", 403, ERROR_MESSAGES.notYourAgency],
      ["admin-1", "advance", 200, null],
      ["admin-1", "no-show", 200, null],
    ] as const)(
      "%s cancelling with %s: %i",
      async (user, reason, status, error) => {
        const response = await cancel(user, "shift-2", reason).expect(status);
        if (error) {
          expect(errorOf(response)).toBe(error);
          expect(await shift("shift-2")).toEqual(SHIFT_2);
        } else {
          expect(
            CancelShiftResponseSchema.parse(response.body).cancellation,
          ).toEqual({
            reason,
            previousNurseId: "nurse-1",
          });
        }
      },
    );

    it.each(["nurse-1", "agency-a", "admin-1"] as const)(
      "answers 409 to %s for an open shift",
      async (user) => {
        const response = await cancel(user, "shift-1", "advance").expect(409);
        expect(errorOf(response)).toBe(ERROR_MESSAGES.shiftNotClaimed);
      },
    );

    it("answers 403 to another agency before saying the shift is open", async () => {
      const response = await cancel("agency-b", "shift-1", "advance").expect(
        403,
      );
      expect(errorOf(response)).toBe(ERROR_MESSAGES.notYourAgency);
    });

    it("answers 404 for an unknown shift", async () => {
      const response = await cancel("admin-1", "shift-999", "advance").expect(
        404,
      );
      expect(errorOf(response)).toBe(ERROR_MESSAGES.shiftNotFound);
    });

    it.each([
      ["an unknown reason", { reason: "sick" }],
      ["no reason", {}],
    ])("answers 400 for %s", async (_, body) => {
      const response = await t
        .http()
        .post("/api/shifts/shift-2/cancel")
        .set(as("admin-1"))
        .send(body)
        .expect(400);
      expect(errorOf(response)).toMatch(/reason/);
    });

    it("lets exactly one of two concurrent cancels win", async () => {
      const responses = await Promise.all([
        cancel("agency-a", "shift-2", "no-show"),
        cancel("admin-1", "shift-2", "advance"),
      ]);
      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const cancellations = await t.prisma.shiftCancellation.count({
        where: { shiftId: "shift-2" },
      });
      expect(cancellations).toBe(1);
      expect(
        (await auditEntries()).filter((e) => e.action === "shift.cancelled"),
      ).toHaveLength(1);
    });

    it("lets the shift be claimed again after a cancellation", async () => {
      await cancel("nurse-1", "shift-2", "advance").expect(200);
      const response = await claim("nurse-1", "shift-2").expect(200);
      expect(ShiftSchema.parse(response.body)).toEqual(SHIFT_2);
    });
  });

  describe("GET /api/agencies/:agencyId/shifts", () => {
    it("returns agency-a's shift-1 and shift-2, full shifts", async () => {
      const response = await t
        .http()
        .get("/api/agencies/agency-a/shifts")
        .set(as("agency-a"))
        .expect(200);
      expect(AgencyShiftListResponseSchema.parse(response.body)).toEqual({
        agencyId: "agency-a",
        shifts: [SHIFT_1, SHIFT_2],
      });
    });

    it("returns agency-b's shift-3 only", async () => {
      const response = await t
        .http()
        .get("/api/agencies/agency-b/shifts")
        .set(as("agency-b"))
        .expect(200);
      expect(AgencyShiftListResponseSchema.parse(response.body)).toEqual({
        agencyId: "agency-b",
        shifts: [SHIFT_3],
      });
    });

    it("answers 403 to another agency", async () => {
      const response = await t
        .http()
        .get("/api/agencies/agency-b/shifts")
        .set(as("agency-a"))
        .expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.notYourAgency);
    });

    it("lets the admin read any agency", async () => {
      const response = await t
        .http()
        .get("/api/agencies/agency-b/shifts")
        .set(as("admin-1"))
        .expect(200);
      expect(AgencyShiftListResponseSchema.parse(response.body).shifts).toEqual(
        [SHIFT_3],
      );
    });

    it("answers 403 to a nurse", async () => {
      const response = await t
        .http()
        .get("/api/agencies/agency-a/shifts")
        .set(as("nurse-1"))
        .expect(403);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.forbidden);
    });
  });
});
