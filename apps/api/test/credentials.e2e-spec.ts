import {
  AuditLogResponseSchema,
  CredentialListResponseSchema,
  CredentialSchema,
  ERROR_MESSAGES,
  MAX_CREDENTIAL_BYTES,
} from "@repo/shared";
import { SEED_CREDENTIALS } from "../src/seed/seed-data.js";
import { binaryParser } from "./binary.js";
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

const [NURSE_1_CREDENTIAL, NURSE_2_CREDENTIAL] = SEED_CREDENTIALS.map(
  (c) => c.id,
) as [string, string];

describe("credentials (e2e)", () => {
  let t: TestApp;
  let tokens: Record<SeedUserId, string>;
  const as = (user: SeedUserId) => bearer(tokens[user]);
  const upload = (file: Buffer, name: string, expiresOn = "2027-12-31") =>
    uploadCredential(t, tokens["nurse-2"], file, name, expiresOn);
  const download = (user: SeedUserId, id: string) =>
    t
      .http()
      .get(`/api/credentials/${id}/file`)
      .set(as(user))
      .buffer(true)
      .parse(binaryParser);

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

  describe("POST /api/credentials", () => {
    it.each([
      [
        "a PDF",
        SAMPLE_FILES.pdf,
        "RN license.pdf",
        "application/pdf",
        "RN-license.pdf",
      ],
      ["a PNG", SAMPLE_FILES.png, "scan.png", "image/png", "scan.png"],
      ["a JPEG", SAMPLE_FILES.jpeg, "photo.jpeg", "image/jpeg", "photo.jpg"],
    ])(
      "stores %s with its detected type",
      async (_, file, name, contentType, stored) => {
        const response = await upload(file, name).expect(201);
        expect(CredentialSchema.parse(response.body)).toMatchObject({
          nurseId: "nurse-2",
          fileName: stored,
          contentType,
          sizeBytes: file.byteLength,
          expiresOn: "2027-12-31",
          status: "valid",
        });
      },
    );

    it("records an expiry in the past as expired", async () => {
      const response = await upload(
        SAMPLE_FILES.pdf,
        "old.pdf",
        "2026-01-31",
      ).expect(201);
      expect(CredentialSchema.parse(response.body).status).toBe("expired");
    });

    it("judges validity against today in UTC, as the clock moves", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const response = await upload(
        SAMPLE_FILES.pdf,
        "today.pdf",
        today,
      ).expect(201);
      expect(CredentialSchema.parse(response.body).status).toBe("valid");
      t.clock.advance(24 * 60 * 60 * 1000);
      try {
        const list = await t
          .http()
          .get("/api/credentials")
          .set(as("nurse-2"))
          .expect(200);
        const stored = CredentialListResponseSchema.parse(
          list.body,
        ).credentials.find((c) => c.expiresOn === today);
        expect(stored?.status).toBe("expired");
      } finally {
        t.clock.advance(-24 * 60 * 60 * 1000);
      }
    });

    it("writes a credential.uploaded audit entry without the file name", async () => {
      const response = await upload(
        SAMPLE_FILES.png,
        "maria-lopez-license.png",
      ).expect(201);
      const { id } = CredentialSchema.parse(response.body);
      const log = await t
        .http()
        .get("/api/admin/audit-log?limit=1")
        .set(as("admin-1"))
        .expect(200);
      const [entry] = AuditLogResponseSchema.parse(log.body).entries;
      expect(entry).toMatchObject({
        actorId: "nurse-2",
        actorRole: "nurse",
        action: "credential.uploaded",
        entityType: "credential",
        entityId: id,
        details: { contentType: "image/png", status: "valid" },
      });
      expect(JSON.stringify(entry)).not.toContain("maria");
    });

    it("sanitizes the file name and sets the extension of the detected type", async () => {
      const response = await upload(
        SAMPLE_FILES.pdf,
        '../../etc/Lícense "final" (1).png',
      );
      expect(response.status).toBe(201);
      expect(CredentialSchema.parse(response.body).fileName).toBe(
        "License-final-1.pdf",
      );
      const unnamed = await upload(SAMPLE_FILES.pdf, "....png").expect(201);
      expect(CredentialSchema.parse(unnamed.body).fileName).toBe("license.pdf");
    });

    it("rejects a text file named .png by its magic bytes", async () => {
      const response = await upload(
        Buffer.from("just some text"),
        "license.png",
      ).expect(400);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.credentialFileType);
    });

    it("rejects a file over the size limit with 413", async () => {
      const response = await upload(SAMPLE_FILES.tooLarge, "big.pdf").expect(
        413,
      );
      expect(errorOf(response)).toBe(ERROR_MESSAGES.credentialFileTooLarge);
      expect(
        await t.prisma.credential.count({ where: { nurseId: "nurse-2" } }),
      ).toBe(1);
    });

    it("accepts a file of exactly the size limit", async () => {
      const file = Buffer.concat([
        Buffer.from("%PDF-1.4\n"),
        Buffer.alloc(MAX_CREDENTIAL_BYTES - 9, 0x20),
      ]);
      const response = await upload(file, "max.pdf").expect(201);
      expect(CredentialSchema.parse(response.body).sizeBytes).toBe(
        MAX_CREDENTIAL_BYTES,
      );
    });

    it("answers 400 without a file", async () => {
      const response = await t
        .http()
        .post("/api/credentials")
        .set(as("nurse-2"))
        .field("expiresOn", "2027-12-31")
        .expect(400);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.credentialFileRequired);
    });

    it("answers 400 for an empty file", async () => {
      const response = await upload(Buffer.alloc(0), "empty.pdf").expect(400);
      expect(errorOf(response)).toBe(ERROR_MESSAGES.credentialFileRequired);
    });

    it.each([
      ["a missing expiry date", undefined],
      ["an impossible date", "2027-02-30"],
      ["another date format", "12/31/2027"],
    ])("answers 400 for %s", async (_, expiresOn) => {
      let request = t.http().post("/api/credentials").set(as("nurse-2"));
      if (expiresOn !== undefined)
        request = request.field("expiresOn", expiresOn);
      const response = await request
        .attach("file", SAMPLE_FILES.pdf, "l.pdf")
        .expect(400);
      expect(errorOf(response)).toMatch(/expiresOn/);
    });

    it("answers 400 for a second file or a file in another field", async () => {
      const two = await t
        .http()
        .post("/api/credentials")
        .set(as("nurse-2"))
        .field("expiresOn", "2027-12-31")
        .attach("file", SAMPLE_FILES.pdf, "a.pdf")
        .attach("file", SAMPLE_FILES.pdf, "b.pdf");
      expect(two.status).toBe(400);
      const other = await t
        .http()
        .post("/api/credentials")
        .set(as("nurse-2"))
        .field("expiresOn", "2027-12-31")
        .attach("document", SAMPLE_FILES.pdf, "a.pdf");
      expect(other.status).toBe(400);
      expect(
        await t.prisma.credential.count({ where: { nurseId: "nurse-2" } }),
      ).toBe(1);
    });
  });

  describe("GET /api/credentials", () => {
    it("lists only her own credentials for a nurse", async () => {
      const response = await t
        .http()
        .get("/api/credentials")
        .set(as("nurse-1"))
        .expect(200);
      expect(
        CredentialListResponseSchema.parse(response.body).credentials,
      ).toEqual([
        {
          id: NURSE_1_CREDENTIAL,
          nurseId: "nurse-1",
          fileName: "sample-license-nurse-1.pdf",
          contentType: "application/pdf",
          sizeBytes: expect.any(Number) as number,
          expiresOn: "2027-01-01",
          uploadedAt: "2026-01-15T09:00:00.000Z",
          status: "valid",
        },
      ]);
    });

    it("shows James Cook's seeded license as expired", async () => {
      const response = await t
        .http()
        .get("/api/credentials")
        .set(as("nurse-2"))
        .expect(200);
      expect(
        CredentialListResponseSchema.parse(response.body).credentials,
      ).toMatchObject([
        { id: NURSE_2_CREDENTIAL, expiresOn: "2026-06-01", status: "expired" },
      ]);
    });

    it("lists everyone's for the admin, newest first per nurse", async () => {
      await upload(SAMPLE_FILES.png, "renewed.png").expect(201);
      const response = await t
        .http()
        .get("/api/credentials")
        .set(as("admin-1"))
        .expect(200);
      const credentials = CredentialListResponseSchema.parse(
        response.body,
      ).credentials;
      expect(credentials.map((c) => [c.nurseId, c.fileName])).toEqual([
        ["nurse-1", "sample-license-nurse-1.pdf"],
        ["nurse-2", "renewed.png"],
        ["nurse-2", "sample-license-nurse-2.pdf"],
      ]);
    });
  });

  describe("GET /api/credentials/:id/file", () => {
    it("serves the uploaded bytes as an attachment with nosniff", async () => {
      const created = await upload(SAMPLE_FILES.png, "scan.png").expect(201);
      const { id } = CredentialSchema.parse(created.body);
      const response = await download("nurse-2", id).expect(200);
      expect(Buffer.compare(response.body as Buffer, SAMPLE_FILES.png)).toBe(0);
      expect(response.headers["content-type"]).toBe("image/png");
      expect(response.headers["content-disposition"]).toBe(
        'attachment; filename="scan.png"',
      );
      expect(response.headers["content-length"]).toBe(
        String(SAMPLE_FILES.png.byteLength),
      );
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["cache-control"]).toBe("private, no-store");
    });

    it("serves the seeded sample license PDF to its nurse and the admin", async () => {
      for (const user of ["nurse-1", "admin-1"] as const) {
        const response = await download(user, NURSE_1_CREDENTIAL).expect(200);
        const pdf = (response.body as Buffer).toString("latin1");
        expect(pdf.startsWith("%PDF-")).toBe(true);
        expect(pdf).toContain("SAMPLE LICENSE - not a real document");
        expect(response.headers["content-type"]).toBe("application/pdf");
      }
    });

    it("answers another nurse 404, as for an unknown id", async () => {
      const other = await download("nurse-2", NURSE_1_CREDENTIAL).expect(404);
      expect(
        errorOf({
          body: JSON.parse((other.body as Buffer).toString()) as unknown,
        }),
      ).toBe(ERROR_MESSAGES.credentialNotFound);
      const unknown = await download(
        "admin-1",
        "00000000-0000-4000-8000-0000000000ff",
      ).expect(404);
      expect(
        errorOf({
          body: JSON.parse((unknown.body as Buffer).toString()) as unknown,
        }),
      ).toBe(ERROR_MESSAGES.credentialNotFound);
    });
  });
});
