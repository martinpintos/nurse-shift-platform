import { Global, Module } from "@nestjs/common";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { Clock } from "./clock.js";

/** App-wide providers every feature module may inject: the clock and analytics. */
@Global()
@Module({
  providers: [Clock, AnalyticsService],
  exports: [Clock, AnalyticsService],
})
export class CommonModule {}
