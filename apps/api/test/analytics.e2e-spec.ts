import { SEED_USERS } from "../src/seed/seed-data.js";
import {
  AnalyticsService,
  type AnalyticsSink,
} from "../src/analytics/analytics.service.js";
import {
  createTestApp,
  loginAll,
  resetDatabase,
  type SeedUserId,
  type TestApp,
} from "./helpers.js";

type Captured = Parameters<AnalyticsSink["capture"]>[0];

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n",
);

describe("analytics (e2e)", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;
  const captured: Captured[] = [];

  beforeAll(async () => {
    const sink: AnalyticsSink = {
      capture: (message) => {
        captured.push(message);
      },
      shutdown: async () => undefined,
    };
    t = await createTestApp({ analytics: AnalyticsService.withSink(sink) });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t);
    tokens = await loginAll(t);
    captured.length = 0;
  });

  function events(): string[] {
    return captured.map((message) => message.event);
  }

  it("records each workflow step after it commits, with ids and enums only", async () => {
    const http = () => t.http();
    await http()
      .post("/api/shifts")
      .set(bearer(tokens["agency-a"]))
      .send({
        role: "RN",
        date: "2026-10-05",
        startTime: "07:00",
        endTime: "19:00",
      })
      .expect(201);
    await http()
      .post("/api/shifts/shift-1/claim")
      .set(bearer(tokens["nurse-1"]))
      .expect(200);
    await http()
      .post("/api/shifts/shift-3/claim")
      .set(bearer(tokens["nurse-2"]))
      .expect(403);
    await http()
      .post("/api/shifts/shift-1/cancel")
      .set(bearer(tokens["agency-a"]))
      .send({ reason: "no-show" })
      .expect(200);
    const submitted = await http()
      .post("/api/timesheets")
      .set(bearer(tokens["nurse-1"]))
      .send({ shiftId: "shift-2", actualStart: "07:00", actualEnd: "19:00" })
      .expect(201);
    await http()
      .post(`/api/timesheets/${(submitted.body as { id: string }).id}/approve`)
      .set(bearer(tokens["agency-a"]))
      .expect(200);
    await http()
      .post("/api/credentials")
      .set(bearer(tokens["nurse-2"]))
      .attach("file", PDF, {
        filename: "renewal.pdf",
        contentType: "application/pdf",
      })
      .field("expiresOn", "2028-01-01")
      .expect(201);

    expect(events()).toEqual([
      "shift_posted",
      "shift_claimed",
      "shift_claim_blocked",
      "shift_cancelled",
      "timesheet_submitted",
      "timesheet_approved",
      "credential_uploaded",
    ]);
    expect(captured[1]).toMatchObject({
      distinctId: "nurse-1",
      properties: { shift_id: "shift-1", agency_id: "agency-a" },
    });
    expect(captured[2]).toMatchObject({
      distinctId: "nurse-2",
      properties: { shift_id: "shift-3", reason: "credential_expired" },
    });
    expect(captured[3]).toMatchObject({
      properties: { reason: "no-show", by_role: "agency" },
    });

    // No personal data anywhere in what was sent.
    const sent = JSON.stringify(captured);
    for (const user of SEED_USERS) {
      expect(sent).not.toContain(user.email);
      expect(sent).not.toContain(user.name);
    }
    expect(sent).not.toContain("@");
    for (const message of captured) {
      expect(message.disableGeoip).toBe(true);
      expect(message.properties["$process_person_profile"]).toBe(false);
    }
  });

  it("records a sign-in with the role only", async () => {
    await t
      .http()
      .post("/api/auth/login")
      .send({ email: "alex.kim@example.com", password: "Trial2026!" })
      .expect(200);
    expect(captured).toEqual([
      {
        distinctId: "admin-1",
        event: "user_logged_in",
        properties: { role: "admin", $process_person_profile: false },
        disableGeoip: true,
      },
    ]);
  });

  it("sends nothing for a refused request", async () => {
    await t
      .http()
      .post("/api/shifts/shift-2/claim")
      .set(bearer(tokens["nurse-1"]))
      .expect(409);
    await t
      .http()
      .post("/api/shifts")
      .set(bearer(tokens["nurse-1"]))
      .send({
        role: "RN",
        date: "2026-10-05",
        startTime: "07:00",
        endTime: "19:00",
      })
      .expect(403);
    expect(captured).toEqual([]);
  });
});
