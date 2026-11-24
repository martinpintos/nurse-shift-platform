import { ServiceUnavailableException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";
import { HealthController } from "./health.controller.js";

function controllerWith(queryRaw: ReturnType<typeof vi.fn>) {
  return new HealthController({
    $queryRaw: queryRaw,
  } as unknown as PrismaService);
}

describe("HealthController", () => {
  it("reports ok when the database answers", async () => {
    await expect(
      controllerWith(vi.fn().mockResolvedValue([{ "?column?": 1 }])).check(),
    ).resolves.toEqual({
      status: "ok",
    });
  });

  it("returns 503 Database unavailable when the query fails", async () => {
    const check = controllerWith(
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1")),
    ).check();
    await expect(check).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(check).rejects.toThrow("Database unavailable");
  });
});
