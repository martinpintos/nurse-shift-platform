// As the seed CLI does: DATABASE_URL from apps/api/.env unless the environment sets it.
import "dotenv/config";
import { PasswordHasher } from "@nestjs/authentication";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  SEED_AGENCIES,
  SEED_CREDENTIALS,
  SEED_PASSWORD,
  SEED_SHIFTS,
  SEED_USERS,
} from "../src/seed/seed-data.js";
import { seedDatabase } from "../src/seed/seed.js";
import { formatDbDate } from "../src/shifts/shift.mapper.js";

/** The seed works on any Prisma client: this file uses its own, as the seed CLI does. */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env["DATABASE_URL"] ?? "",
  }),
});

/** Every row of every app table, in a stable order. */
async function snapshot() {
  return {
    agencies: await prisma.agency.findMany({ orderBy: { id: "asc" } }),
    users: await prisma.user.findMany({ orderBy: { id: "asc" } }),
    shifts: await prisma.shift.findMany({
      orderBy: { id: "asc" },
      omit: { createdAt: true, updatedAt: true },
    }),
    credentials: await prisma.credential.findMany({ orderBy: { id: "asc" } }),
    cancellations: await prisma.shiftCancellation.findMany({
      orderBy: { id: "asc" },
    }),
    timesheets: await prisma.timesheet.findMany({ orderBy: { id: "asc" } }),
    audit: await prisma.auditLog.findMany({ orderBy: { seq: "asc" } }),
    outbox: await prisma.outboxMessage.findMany({ orderBy: { seq: "asc" } }),
  };
}

async function nextShiftId(): Promise<string> {
  const shift = await prisma.shift.create({
    data: {
      agencyId: "agency-a",
      role: "RN",
      date: new Date("2026-12-01T00:00:00.000Z"),
      startTime: "07:00",
      endTime: "19:00",
    },
  });
  return shift.id;
}

describe("seedDatabase (e2e)", () => {
  beforeEach(async () => {
    await seedDatabase(prisma, "reset");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("loads the spec's sample data exactly", async () => {
    const data = await snapshot();
    expect(data.agencies).toEqual(SEED_AGENCIES);
    expect(
      data.users.map(({ id, name, email, role, agencyId }) => ({
        id,
        name,
        email,
        role,
        agencyId,
      })),
    ).toEqual([...SEED_USERS].sort((a, b) => a.id.localeCompare(b.id)));
    expect(
      data.shifts.map((shift) => ({
        ...shift,
        date: formatDbDate(shift.date),
      })),
    ).toEqual(SEED_SHIFTS);
    expect(
      data.credentials.map((c) => [
        c.id,
        c.nurseId,
        formatDbDate(c.expiresOn),
        c.contentType,
      ]),
    ).toEqual(
      SEED_CREDENTIALS.map((c) => [
        c.id,
        c.nurseId,
        c.expiresOn,
        c.contentType,
      ]),
    );
    expect(data.cancellations).toEqual([]);
    expect(data.timesheets).toEqual([]);
    expect(data.audit).toEqual([]);
    expect(data.outbox).toEqual([]);
  });

  it("hashes every password with scrypt and a salt of its own", async () => {
    const hasher = new PasswordHasher();
    const users = await prisma.user.findMany();
    expect(new Set(users.map((u) => u.passwordHash)).size).toBe(users.length);
    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$scrypt\$/);
      expect(await hasher.verify(SEED_PASSWORD, user.passwordHash)).toBe(true);
    }
  });

  it("stores a sample license PDF for each nurse", async () => {
    for (const credential of await prisma.credential.findMany()) {
      const text = Buffer.from(credential.data).toString("latin1");
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text).toContain("SAMPLE LICENSE - not a real document");
      expect(credential.sizeBytes).toBe(credential.data.byteLength);
    }
  });

  it("ensure, twice, leaves identical rows", async () => {
    const before = await snapshot();
    await seedDatabase(prisma, "ensure");
    await seedDatabase(prisma, "ensure");
    expect(await snapshot()).toEqual(before);
  });

  it("ensure never overwrites demo activity", async () => {
    await prisma.shift.update({
      where: { id: "shift-1" },
      data: { status: "filled", claimedById: "nurse-1" },
    });
    await prisma.shift.update({
      where: { id: "shift-2" },
      data: { status: "open", claimedById: null },
    });
    await prisma.credential.update({
      where: { id: SEED_CREDENTIALS[1]?.id ?? "" },
      data: { expiresOn: new Date("2030-01-01T00:00:00.000Z") },
    });
    const changed = await snapshot();
    await seedDatabase(prisma, "ensure");
    expect(await snapshot()).toEqual(changed);
  });

  it("ensure puts back only what is missing", async () => {
    const full = await snapshot();
    await prisma.credential.delete({
      where: { id: SEED_CREDENTIALS[0]?.id ?? "" },
    });
    await prisma.shift.delete({ where: { id: "shift-3" } });
    await seedDatabase(prisma, "ensure");
    const restored = await snapshot();
    expect(restored.credentials).toEqual(full.credentials);
    expect(restored.shifts).toEqual(full.shifts);
    expect(restored.users).toEqual(full.users);
  });

  it("ensure fills an empty database", async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "AuditLog", "OutboxMessage", "Timesheet", "ShiftCancellation", "Credential", "Shift", "User", "Agency" CASCADE',
    );
    await seedDatabase(prisma, "ensure");
    const data = await snapshot();
    expect(data.agencies).toHaveLength(2);
    expect(data.users).toHaveLength(5);
    expect(data.shifts).toHaveLength(3);
    expect(data.credentials).toHaveLength(2);
  });

  it("reset restores the spec's data after changes", async () => {
    const pristine = await snapshot();
    await prisma.shift.update({
      where: { id: "shift-2" },
      data: { status: "open", claimedById: null },
    });
    await nextShiftId();
    await prisma.credential.deleteMany();
    await prisma.auditLog.create({
      data: {
        actorId: "admin-1",
        actorRole: "admin",
        action: "shift.posted",
        entityType: "shift",
        entityId: "shift-4",
      },
    });
    await seedDatabase(prisma, "reset");
    const after = await snapshot();
    // Users get fresh rows; hashes are cached per process, so they match too.
    expect(after).toEqual(pristine);
  });

  it("continues shift ids at shift-4 after a reset", async () => {
    await nextShiftId();
    await nextShiftId();
    await seedDatabase(prisma, "reset");
    expect(await nextShiftId()).toBe("shift-4");
  });

  it("continues after the highest existing shift on ensure", async () => {
    expect(await nextShiftId()).toBe("shift-4");
    expect(await nextShiftId()).toBe("shift-5");
    await seedDatabase(prisma, "ensure");
    expect(await nextShiftId()).toBe("shift-6");
  });

  it("moves the sequence to at least 3 even when the seed shifts already exist", async () => {
    await prisma.$queryRaw`SELECT setval('shift_id_seq', 1)`;
    await seedDatabase(prisma, "ensure");
    expect(await nextShiftId()).toBe("shift-4");
  });
});
