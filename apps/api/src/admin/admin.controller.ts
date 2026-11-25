import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
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
}
