import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Access } from "../auth/access.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * GET /api/health. Public on purpose, the one exception to "every route except login
 * requires a token": deploy platforms probe it without credentials, and it returns no data.
 */
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Access("GET /api/health")
  async check(): Promise<{ status: "ok" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
    return { status: "ok" };
  }
}
