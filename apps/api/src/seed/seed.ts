import { PasswordHasher } from "@nestjs/authentication";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { Tx } from "../prisma/db.js";
import { parseDbDate } from "../shifts/shift.mapper.js";
import { sampleLicensePdf } from "./sample-license.js";
import {
  MIN_SHIFT_SEQUENCE,
  SEED_AGENCIES,
  SEED_CREDENTIALS,
  SEED_PASSWORD,
  SEED_SHIFTS,
  SEED_USERS,
  type SeedUser,
} from "./seed-data.js";

/**
 * `ensure` inserts only the seed rows that are missing: idempotent, and it never touches
 * demo activity (a claimed shift-1 stays claimed). `reset` truncates every app table and
 * re-inserts the spec's data, as at trial start.
 */
export type SeedMode = "ensure" | "reset";

/** Every app table (not `_prisma_migrations`). */
const APP_TABLES = [
  "AuditLog",
  "OutboxMessage",
  "Timesheet",
  "ShiftCancellation",
  "Credential",
  "Shift",
  "User",
  "Agency",
] as const;

const hasher = new PasswordHasher();
/**
 * One scrypt hash per seed user per process. A hash is deliberately slow (~0.2s), and a
 * reset re-inserts every user; each still has its own random salt.
 */
const passwordHashes = new Map<string, Promise<string>>();

function passwordHashFor(userId: string): Promise<string> {
  let hash = passwordHashes.get(userId);
  if (!hash) {
    hash = hasher.hash(SEED_PASSWORD);
    // A failed hash is not kept: the next seed tries again.
    void hash.catch(() => passwordHashes.delete(userId));
    passwordHashes.set(userId, hash);
  }
  return hash;
}

/**
 * Seeds the database with the sample data of docs/spec.md. Runs in one transaction;
 * `then` runs inside it after the seed (the admin reset writes its audit entry there).
 * Both modes finish by moving `shift_id_seq` to the highest shift number (at least 3), so
 * the next posted shift is `shift-4` after a reset.
 */
export async function seedDatabase(
  prisma: PrismaClient,
  mode: SeedMode,
  then?: (tx: Tx) => Promise<void>,
): Promise<void> {
  // Hash outside the transaction, so it holds no locks while scrypt runs.
  const existing =
    mode === "ensure"
      ? new Set(
          (await prisma.user.findMany({ select: { id: true } })).map(
            (u) => u.id,
          ),
        )
      : new Set<string>();
  const users: (SeedUser & { passwordHash: string })[] = [];
  for (const user of SEED_USERS.filter((u) => !existing.has(u.id))) {
    users.push({
      ...user,
      email: user.email.toLowerCase(),
      passwordHash: await passwordHashFor(user.id),
    });
  }

  await prisma.$transaction(
    async (tx) => {
      if (mode === "reset") {
        const tables = APP_TABLES.map((table) => `"${table}"`).join(", ");
        // Static table names only, no input: safe as raw SQL.
        await tx.$executeRawUnsafe(
          `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
        );
      }
      await insertMissing(tx, users);
      await moveShiftSequence(tx);
      await then?.(tx);
    },
    { timeout: 30_000 },
  );
}

async function insertMissing(
  tx: Tx,
  users: readonly (SeedUser & { passwordHash: string })[],
): Promise<void> {
  await tx.agency.createMany({
    data: [...SEED_AGENCIES],
    skipDuplicates: true,
  });
  if (users.length > 0) {
    await tx.user.createMany({ data: [...users], skipDuplicates: true });
  }
  await tx.shift.createMany({
    data: SEED_SHIFTS.map((shift) => ({
      ...shift,
      date: parseDbDate(shift.date),
    })),
    skipDuplicates: true,
  });
  const names = new Map(SEED_USERS.map((user) => [user.id, user.name]));
  await tx.credential.createMany({
    data: SEED_CREDENTIALS.map((credential) => {
      const data = sampleLicensePdf({
        nurseId: credential.nurseId,
        nurseName: names.get(credential.nurseId) ?? credential.nurseId,
        expiresOn: credential.expiresOn,
      });
      return {
        id: credential.id,
        nurseId: credential.nurseId,
        fileName: `sample-license-${credential.nurseId}.pdf`,
        contentType: credential.contentType,
        sizeBytes: data.byteLength,
        data,
        expiresOn: parseDbDate(credential.expiresOn),
        uploadedAt: new Date(credential.uploadedAt),
      };
    }),
    skipDuplicates: true,
  });
}

/** `setval` to the highest `shift-<n>` in the table, at least the seed's 3. */
async function moveShiftSequence(tx: Tx): Promise<void> {
  await tx.$queryRaw`
    SELECT setval(
      'shift_id_seq',
      GREATEST(
        ${MIN_SHIFT_SEQUENCE}::bigint,
        COALESCE(MAX(substring("id" from '^shift-([0-9]+)$')::bigint), 0)
      )
    )::text AS "value"
    FROM "Shift"`;
}
