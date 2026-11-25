import { Injectable } from "@nestjs/common";

/**
 * The current time, injected so tests can move it: login throttle windows, credential
 * status, approval times. Row timestamps the database defaults (`now()`) don't use it.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}

/** Today's calendar date in UTC as `YYYY-MM-DD`. */
export function utcToday(clock: Clock): string {
  return clock.now().toISOString().slice(0, 10);
}
