import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ErrorResponseSchema,
  LoginResponseSchema,
  MAX_CREDENTIAL_BYTES,
} from "@repo/shared";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { Clock } from "../src/common/clock.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { sampleLicensePdf } from "../src/seed/sample-license.js";
import { SEED_PASSWORD, SEED_USERS } from "../src/seed/seed-data.js";
import { seedDatabase } from "../src/seed/seed.js";

/** A clock tests can move forward. Starts at the real time. */
export class TestClock extends Clock {
  private offsetMs = 0;

  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }
}

export type SeedUserId =
  "nurse-1" | "nurse-2" | "admin-1" | "agency-a" | "agency-b";
export const SEED_USER_IDS: readonly SeedUserId[] = [
  "nurse-1",
  "nurse-2",
  "admin-1",
  "agency-a",
  "agency-b",
];

export interface TestApp {
  app: INestApplication<App>;
  prisma: PrismaService;
  clock: TestClock;
  /** A fresh supertest client for the app. */
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** Boots the real app, as main.ts does, with a movable clock. */
export async function createTestApp(): Promise<TestApp> {
  const clock = new TestClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<INestApplication<App>>(),
  );
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    clock,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Back to the spec's sample data. */
export function resetDatabase(t: TestApp): Promise<void> {
  return seedDatabase(t.prisma, "reset");
}

export function emailOf(userId: SeedUserId): string {
  const user = SEED_USERS.find((u) => u.id === userId);
  if (!user) throw new Error(`No seed user ${userId}`);
  return user.email;
}

/** Signs in through POST /api/auth/login and returns the token. */
export async function login(t: TestApp, userId: SeedUserId): Promise<string> {
  const response = await t
    .http()
    .post("/api/auth/login")
    .send({ email: emailOf(userId), password: SEED_PASSWORD })
    .expect(200);
  return LoginResponseSchema.parse(response.body).token;
}

/** A token for every seed user. Tokens survive a reset: the ids don't change. */
export async function loginAll(
  t: TestApp,
): Promise<Record<SeedUserId, string>> {
  const tokens: Partial<Record<SeedUserId, string>> = {};
  for (const id of SEED_USER_IDS) tokens[id] = await login(t, id);
  return tokens as Record<SeedUserId, string>;
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** The `{ error }` message of an error response. */
export function errorOf(response: { body: unknown }): string {
  return ErrorResponseSchema.parse(response.body).error;
}

/** A small valid PDF, PNG and JPEG (by magic bytes) for uploads. */
export const SAMPLE_FILES = {
  pdf: Buffer.from(
    sampleLicensePdf({
      nurseId: "nurse-2",
      nurseName: "James Cook",
      expiresOn: "2027-12-31",
    }),
  ),
  png: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("not really an image, but PNG by its magic bytes"),
  ]),
  jpeg: Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("not really an image, but JPEG by its magic bytes"),
  ]),
  /** One byte over the limit, PDF by its magic bytes. */
  tooLarge: Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.alloc(MAX_CREDENTIAL_BYTES + 1 - 9, 0x20),
  ]),
};

/** Uploads a license for a nurse and returns the response. */
export function uploadCredential(
  t: TestApp,
  token: string,
  file: Buffer,
  fileName: string,
  expiresOn: string,
) {
  return t
    .http()
    .post("/api/credentials")
    .set(bearer(token))
    .field("expiresOn", expiresOn)
    .attach("file", file, fileName);
}
