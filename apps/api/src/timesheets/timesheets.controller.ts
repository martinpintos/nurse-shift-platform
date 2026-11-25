import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "@nestjs/authentication";
import {
  IdSchema,
  SubmitTimesheetRequestSchema,
  type SubmitTimesheetRequest,
  type Timesheet,
  type TimesheetListResponse,
} from "@repo/shared";
import { Access } from "../auth/access.js";
import type { Principal } from "../auth/principal.js";
import { TimesheetsService } from "./timesheets.service.js";

@Controller("timesheets")
export class TimesheetsController {
  constructor(
    @Inject(TimesheetsService) private readonly timesheets: TimesheetsService,
  ) {}

  @Get()
  @Access("GET /api/timesheets")
  list(@CurrentUser() principal: Principal): Promise<TimesheetListResponse> {
    return this.timesheets.list(principal);
  }

  @Post()
  @Access("POST /api/timesheets")
  submit(
    @CurrentUser() principal: Principal,
    @Body({ schema: SubmitTimesheetRequestSchema })
    body: SubmitTimesheetRequest,
  ): Promise<Timesheet> {
    return this.timesheets.submit(principal, body);
  }

  @Post(":id/approve")
  @Access("POST /api/timesheets/:id/approve")
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() principal: Principal,
    @Param("id", { schema: IdSchema }) id: string,
  ): Promise<Timesheet> {
    return this.timesheets.approve(principal, id);
  }
}
