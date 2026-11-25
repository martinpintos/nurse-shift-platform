import { AuditLogResponseSchema } from "@repo/shared";
import { strFromU8, unzipSync } from "fflate";
import { SEED_CREDENTIALS } from "../src/seed/seed-data.js";
import { binaryParser } from "./binary.js";
import {
  bearer,
  createTestApp,
  loginAll,
  resetDatabase,
  type SeedUserId,
  type TestApp,
} from "./helpers.js";

describe("license export (e2e)", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t);
    tokens = await loginAll(t);
  });

  it("zips every license document with a compliance CSV, as an attachment", async () => {
    // Pin "today" so the CSV status is deterministic.
    t.clock.advance(
      Date.parse("2026-11-24T12:00:00Z") - t.clock.now().getTime(),
    );
    const response = await t
      .http()
      .get("/api/admin/exports/licenses")
      .set(bearer(tokens["admin-1"]))
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="shiftpatch-licenses-2026-11-24.zip"',
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");

    const files = unzipSync(new Uint8Array(response.body as Buffer));
    const documents = Object.keys(files).filter((name) =>
      name.startsWith("licenses/"),
    );
    expect(documents).toHaveLength(SEED_CREDENTIALS.length);
    for (const name of documents) {
      expect(strFromU8(files[name]!.subarray(0, 5))).toBe("%PDF-");
    }
    const csv = strFromU8(files["compliance.csv"]!);
    expect(csv).toContain("nurse-1,Maria Lopez,1,2027-01-01,valid");
    expect(csv).toContain("nurse-2,James Cook,1,2026-06-01,expired");
    expect(strFromU8(files["README.txt"]!)).toContain(
      "TB test results are not stored",
    );
  });

  it("writes every export to the audit log", async () => {
    await t
      .http()
      .get("/api/admin/exports/licenses")
      .set(bearer(tokens["admin-1"]))
      .expect(200);
    const log = await t
      .http()
      .get("/api/admin/audit-log?limit=1")
      .set(bearer(tokens["admin-1"]))
      .expect(200);
    expect(AuditLogResponseSchema.parse(log.body).entries[0]).toMatchObject({
      actorId: "admin-1",
      action: "licenses.exported",
      entityType: "system",
      details: { documents: SEED_CREDENTIALS.length, nurses: 2 },
    });
  });

  it("is admin-only, and a refused request leaves no audit entry", async () => {
    for (const user of ["nurse-1", "agency-a"] as const) {
      await t
        .http()
        .get("/api/admin/exports/licenses")
        .set(bearer(tokens[user]))
        .expect(403);
    }
    const log = await t
      .http()
      .get("/api/admin/audit-log")
      .set(bearer(tokens["admin-1"]))
      .expect(200);
    expect(
      AuditLogResponseSchema.parse(log.body).entries.map((e) => e.action),
    ).not.toContain("licenses.exported");
  });
});
