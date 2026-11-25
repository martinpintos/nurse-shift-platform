import { Global, Module } from "@nestjs/common";
import { Clock } from "./clock.js";

/** App-wide providers every feature module may inject. */
@Global()
@Module({
  providers: [Clock],
  exports: [Clock],
})
export class CommonModule {}
