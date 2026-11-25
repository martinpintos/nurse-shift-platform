import {
  AdminShiftListResponseSchema,
  AuditLogResponseSchema,
  OutboxResponseSchema,
  ShiftListResponseSchema,
  ShiftSchema,
} from "@repo/shared";
import { SEED_USERS } from "../src/seed/seed-data.js";
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

describe("admin (e2e)", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;
  const as = (user: SeedUserId) => bearer(tokens[user]);
  const postShift = (date = "2026-10-05") =>
    t
      .http()
      .post("/api/shifts")
      .set(as("agency-a"))
      .send({ role: "RN", date, startTime: "07:00", endTime: "19:00" })
      .expect(201);
  const auditLog = async (query = "") =>
    AuditLogResponseSchema.parse(
      (
        await t
          .http()
          .get(`/api/admin/audit-log${query}`)
          .set(as("admin-1"))
          .expect(200)
      ).body,
    ).entries;

  /** Claims, cancels, posts and uploads: one of every audited change. */
  async function demoActivity(): Promise<void> {
    await t
      .http()
      .post("/api/shifts/shift-1/claim")
      .set(as("nurse-1"))
      .expect(200);
    await t
      .http()
      .post("/api/shifts/shift-2/cancel")
      .set(as("agency-a"))
      .send({ reason: "no-show" })
      .expect(200);
    await postShift();
    await uploadCredential(
      t,
      tokens["nurse-2"],
      SAMPLE_FILES.png,
      "James Cook.png",
      "2027-12-31",
    ).expect(201);
    const timesheet = await t
      .http()
      .post("/api/timesheets")
      .set(as("nurse-1"))
      .send({ shiftId: "shift-1", actualStart: "19:00", actualEnd: "07:00" })
      .expect(201);
    await t
      .http()
      .post(`/api/timesheets/${(timesheet.body as { id: string }).id}/approve`)
      .set(as("agency-a"))
      .expect(200);
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

  describe("GET /api/admin/shifts", () => {
    it("lists every shift with empty history at trial start", async () => {
      const response = await t
        .http()
        .get("/api/admin/shifts")
        .set(as("admin-1"))
        .expect(200);
      const shifts = AdminShiftListResponseSchema.parse(response.body).shifts;
      expect(
        shifts.map((s) => [s.id, s.status, s.claimedBy, s.timesheetStatus]),
      ).toEqual([
        ["shift-1", "open", null, null],
        ["shift-2", "filled", "nurse-1", null],
        ["shift-3", "open", null, null],
      ]);
      expect(shifts.every((s) => s.cancellations.length === 0)).toBe(true);
    });
  });

  describe("GET /api/admin/audit-log", () => {
    it("lists entries newest first, up to ?limit", async () => {
      await postShift();
      await postShift();
      await postShift();
      expect((await auditLog()).map((e) => e.entityId)).toEqual([
        "shift-6",
        "shift-5",
        "shift-4",
      ]);
      expect((await auditLog("?limit=2")).map((e) => e.entityId)).toEqual([
        "shift-6",
        "shift-5",
      ]);
    });

    it.each(["0", "501", "ten", "1.5"])(
      "answers 400 for ?limit=%s",
      async (limit) => {
        const response = await t
          .http()
          .get(`/api/admin/audit-log?limit=${limit}`)
          .set(as("admin-1"))
          .expect(400);
        expect(errorOf(response)).toMatch(/limit/);
      },
    );

    it("writes one entry per state change, with ids and enum values only", async () => {
      await demoActivity();
      const response = AuditLogResponseSchema.parse(
        (
          await t
            .http()
            .get("/api/admin/audit-log")
            .set(as("admin-1"))
            .expect(200)
        ).body,
      );
      const { entries } = response;
      expect(entries.map((e) => e.action).reverse()).toEqual([
        "shift.claimed",
        "shift.cancelled",
        "shift.posted",
        "credential.uploaded",
        "timesheet.submitted",
        "timesheet.approved",
      ]);
      // The entries (details included) stay ids and enums; names live only in refs.people.
      const serialized = JSON.stringify(entries);
      for (const user of SEED_USERS) {
        expect(serialized).not.toContain(user.name);
        expect(serialized).not.toContain(user.email);
      }
      expect(serialized).not.toContain("Sunrise");
      expect(serialized).not.toContain(".png");
      // refs carries names (and shift descriptions), never emails or file names.
      const refs = JSON.stringify(response.refs);
      expect(refs).not.toContain("@");
      expect(refs).not.toContain(".png");
      expect(response.refs.people).toEqual({
        "agency-a": { name: "Sunrise Health Staffing", role: "agency" },
        "nurse-1": { name: "Maria Lopez", role: "nurse" },
        "nurse-2": { name: "James Cook", role: "nurse" },
      });
      // Shift refs name the agency (ShiftRef.agencyName), never a person.
      const shiftRefs = JSON.stringify(response.refs.shifts);
      for (const user of SEED_USERS.filter((u) => u.role !== "agency")) {
        expect(shiftRefs).not.toContain(user.name);
      }
      // The stored rows are unchanged: ids and enum values only.
      const stored = JSON.stringify(await t.prisma.auditLog.findMany());
      for (const user of SEED_USERS) expect(stored).not.toContain(user.name);
    });
  });

  describe("GET /api/admin/outbox", () => {
    it("lists the claim and cancellation notifications newest first", async () => {
      await t
        .http()
        .post("/api/shifts/shift-1/claim")
        .set(as("nurse-1"))
        .expect(200);
      await t
        .http()
        .post("/api/shifts/shift-2/cancel")
        .set(as("admin-1"))
        .send({ reason: "advance" })
        .expect(200);
      const response = await t
        .http()
        .get("/api/admin/outbox")
        .set(as("admin-1"))
        .expect(200);
      const messages = OutboxResponseSchema.parse(response.body).messages;
      expect(messages.map((m) => [m.template, m.shiftId])).toEqual([
        ["shift.cancelled", "shift-2"],
        ["shift.cancelled", "shift-2"],
        ["shift.claimed", "shift-1"],
        ["shift.claimed", "shift-1"],
      ]);
      const toAgency = messages.find(
        (m) => m.template === "shift.claimed" && m.recipientId === "agency-a",
      );
      expect(toAgency).toMatchObject({
        recipientEmail: "admin@sunrisehealth.example",
        subject: "Shift shift-1 was claimed",
        body: "Maria Lopez (nurse-1) claimed RN shift shift-1 on 2026-10-02, 19:00 to 07:00.",
      });
    });
  });

  describe("POST /api/admin/reset", () => {
    it("restores the spec's data and logs the reset as the first entry", async () => {
      await demoActivity();
      const response = await t
        .http()
        .post("/api/admin/reset")
        .set(as("admin-1"))
        .expect(200);
      expect(response.body).toEqual({ status: "reset" });

      const shifts = await t
        .http()
        .get("/api/shifts")
        .set(as("nurse-1"))
        .expect(200);
      expect(
        ShiftListResponseSchema.parse(shifts.body).shifts.map((s) => [
          s.id,
          s.status,
          s.claimedBy,
        ]),
      ).toEqual([
        ["shift-1", "open", null],
        ["shift-2", "filled", "nurse-1"],
        ["shift-3", "open", null],
      ]);
      expect(await t.prisma.credential.count()).toBe(2);
      expect(await t.prisma.timesheet.count()).toBe(0);
      expect(await t.prisma.shiftCancellation.count()).toBe(0);
      const outbox = await t
        .http()
        .get("/api/admin/outbox")
        .set(as("admin-1"))
        .expect(200);
      expect(OutboxResponseSchema.parse(outbox.body).messages).toEqual([]);

      const entries = await auditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorId: "admin-1",
        actorRole: "admin",
        action: "admin.reset",
        entityType: "system",
        entityId: null,
        details: {},
      });

      const next = await postShift();
      expect(ShiftSchema.parse(next.body).id).toBe("shift-4");
    });

    it("keeps existing tokens working: the seed ids don't change", async () => {
      await t.http().post("/api/admin/reset").set(as("admin-1")).expect(200);
      await t.http().get("/api/auth/me").set(as("nurse-2")).expect(200);
    });
  });
});
