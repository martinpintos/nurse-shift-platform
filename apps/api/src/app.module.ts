import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CommonModule } from "./common/common.module.js";
import { validateEnv } from "./config/env.js";
import { CredentialsModule } from "./credentials/credentials.module.js";
import { HealthModule } from "./health/health.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ShiftsModule } from "./shifts/shifts.module.js";
import { TimesheetsModule } from "./timesheets/timesheets.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    CommonModule,
    // First: its global guards authenticate and authorize every route below.
    AuthModule,
    HealthModule,
    ShiftsModule,
    CredentialsModule,
    TimesheetsModule,
    AdminModule,
  ],
})
export class AppModule {}
