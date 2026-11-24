import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ErrorResponseSchema } from "@repo/shared";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";

describe("app (e2e)", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<INestApplication<App>>(),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers an unknown /api route with 404 and the { error } shape", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/does-not-exist")
      .expect(404);
    expect(ErrorResponseSchema.parse(response.body).error).toContain(
      "/api/does-not-exist",
    );
  });

  it("serves nothing outside the /api prefix", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .expect(404);
    expect(ErrorResponseSchema.safeParse(response.body).success).toBe(true);
  });
});
