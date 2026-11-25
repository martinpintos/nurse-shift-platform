import { Module } from "@nestjs/common";
import {
  AgencyShiftsController,
  ShiftsController,
} from "./shifts.controller.js";
import { ShiftsService } from "./shifts.service.js";

@Module({
  controllers: [ShiftsController, AgencyShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
