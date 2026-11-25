import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CurrentUser } from "@nestjs/authentication";
import {
  AuditLogQuerySchema,
  type AdminShiftListResponse,
  type AuditLogQuery,
  type AuditLogResponse,
  type OutboxResponse,
  type ResetResponse,
} from "@repo/shared";
import type { Response } from "express";
import { Access } from "../auth/access.js";
import type { Principal } from "../auth/principal.js";
import { AdminService } from "./admin.service.js";

@Controller("admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("shifts")
  @Access("GET /api/admin/shifts")
  shifts(): Promise<AdminShiftListResponse> {
    return this.admin.shifts();
  }

  @Get("audit-log")
  @Access("GET /api/admin/audit-log")
  auditLog(
    @Query({ schema: AuditLogQuerySchema }) query: AuditLogQuery,
  ): Promise<AuditLogResponse> {
    return this.admin.auditLog(query.limit);
  }

  @Get("outbox")
  @Access("GET /api/admin/outbox")
  outbox(): Promise<OutboxResponse> {
    return this.admin.outbox();
  }

  @Post("reset")
  @Access("POST /api/admin/reset")
  @HttpCode(HttpStatus.OK)
  reset(@CurrentUser() principal: Principal): Promise<ResetResponse> {
    return this.admin.reset(principal);
  }

  /** A zip of every license document plus compliance.csv. Every export is audited. */
  @Get("exports/licenses")
  @Access("GET /api/admin/exports/licenses")
  async exportLicenses(
    @CurrentUser() principal: Principal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.admin.exportLicenses(principal);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(file.data, {
      type: "application/zip",
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.data.byteLength,
    });
  }
}
