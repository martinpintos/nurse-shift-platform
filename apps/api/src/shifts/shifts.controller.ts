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
  CancelShiftRequestSchema,
  CreateShiftRequestSchema,
  IdSchema,
  type AgencyPeopleResponse,
  type AgencyShiftListResponse,
  type CancelShiftRequest,
  type CancelShiftResponse,
  type CreateShiftRequest,
  type Shift,
  type ShiftListResponse,
} from "@repo/shared";
import { Access } from "../auth/access.js";
import type { Principal } from "../auth/principal.js";
import { ShiftsService } from "./shifts.service.js";

/** The spec's shift routes (docs/spec.md), shapes unchanged. */
@Controller("shifts")
export class ShiftsController {
  constructor(@Inject(ShiftsService) private readonly shifts: ShiftsService) {}

  @Get()
  @Access("GET /api/shifts")
  list(): Promise<ShiftListResponse> {
    return this.shifts.list();
  }

  @Post()
  @Access("POST /api/shifts")
  create(
    @CurrentUser() principal: Principal,
    @Body({ schema: CreateShiftRequestSchema }) body: CreateShiftRequest,
  ): Promise<Shift> {
    return this.shifts.create(principal, body);
  }

  @Post(":id/claim")
  @Access("POST /api/shifts/:id/claim")
  @HttpCode(HttpStatus.OK)
  claim(
    @CurrentUser() principal: Principal,
    @Param("id", { schema: IdSchema }) id: string,
  ): Promise<Shift> {
    return this.shifts.claim(principal, id);
  }

  @Post(":id/cancel")
  @Access("POST /api/shifts/:id/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() principal: Principal,
    @Param("id", { schema: IdSchema }) id: string,
    @Body({ schema: CancelShiftRequestSchema }) body: CancelShiftRequest,
  ): Promise<CancelShiftResponse> {
    return this.shifts.cancel(principal, id, body.reason);
  }
}

@Controller("agencies")
export class AgencyShiftsController {
  constructor(@Inject(ShiftsService) private readonly shifts: ShiftsService) {}

  @Get(":agencyId/shifts")
  @Access("GET /api/agencies/:agencyId/shifts")
  list(
    @CurrentUser() principal: Principal,
    @Param("agencyId", { schema: IdSchema }) agencyId: string,
  ): Promise<AgencyShiftListResponse> {
    return this.shifts.listForAgency(principal, agencyId);
  }

  @Get(":agencyId/people")
  @Access("GET /api/agencies/:agencyId/people")
  people(
    @CurrentUser() principal: Principal,
    @Param("agencyId", { schema: IdSchema }) agencyId: string,
  ): Promise<AgencyPeopleResponse> {
    return this.shifts.peopleForAgency(principal, agencyId);
  }
}
