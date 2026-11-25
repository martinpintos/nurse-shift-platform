import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostHog } from "posthog-node";
import type { Env } from "../config/env.js";
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "./analytics.events.js";

/** What the service needs from a PostHog client; tests pass a recording fake. */
export interface AnalyticsSink {
  capture(message: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
    disableGeoip: boolean;
  }): void;
  shutdown(): Promise<void>;
}

/**
 * Server-side product analytics. Events go out only after the change they describe has
 * committed, carry ids and enum values only (see analytics.events.ts), with GeoIP off
 * and no person profiles. Without POSTHOG_KEY (local, tests) it does nothing.
 */
@Injectable()
export class AnalyticsService implements OnApplicationShutdown {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly sink: AnalyticsSink | null;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    const key = config.get("POSTHOG_KEY", { infer: true });
    if (!key) {
      this.sink = null;
      return;
    }
    const client = new PostHog(key, {
      host: config.get("POSTHOG_HOST", { infer: true }),
      flushAt: 20,
    });
    logDelivery(client, this.logger);
    this.sink = client;
  }

  /** For tests: a service that records into `sink` instead of PostHog. */
  static withSink(sink: AnalyticsSink): AnalyticsService {
    const service = Object.create(
      AnalyticsService.prototype,
    ) as AnalyticsService;
    Object.assign(service, {
      logger: new Logger(AnalyticsService.name),
      sink,
    });
    return service;
  }

  get enabled(): boolean {
    return this.sink !== null;
  }

  /**
   * Sends one event. Properties that don't match the event's allow-list are a bug: the
   * event is dropped and logged by name only, never sent. Analytics never fails a request.
   */
  capture<E extends AnalyticsEventName>(
    event: E,
    distinctId: string,
    properties: AnalyticsProperties<E>,
  ): void {
    if (!this.sink) return;
    const parsed = ANALYTICS_EVENTS[event].safeParse(properties);
    if (!parsed.success) {
      this.logger.warn(
        `Dropped analytics event "${event}": properties outside its allow-list`,
      );
      return;
    }
    try {
      this.sink.capture({
        distinctId,
        event,
        // Anonymous events: PostHog builds no person profile from them.
        properties: { ...parsed.data, $process_person_profile: false },
        disableGeoip: true,
      });
    } catch {
      this.logger.warn(`Could not queue analytics event "${event}"`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.sink?.shutdown();
  }
}

/** The part of posthog-node's client used to observe delivery. */
export interface DeliveryEvents {
  on(event: "flush" | "error", listener: (payload: unknown) => void): unknown;
}

/**
 * Logs each batch sent to PostHog (a count and the event names, never their properties)
 * and any delivery failure (its kind only). Sent lines with no failure warnings in the
 * deployment's logs mean PostHog took the events: a failed or unconfirmed batch also
 * raises an error, logged as "delivery failed".
 */
export function logDelivery(client: DeliveryEvents, logger: Logger): void {
  client.on("flush", (messages) => {
    const sent = Array.isArray(messages)
      ? (messages as { event?: unknown }[])
      : [];
    const names = [
      ...new Set(
        sent.map((m) => (typeof m.event === "string" ? m.event : "?")),
      ),
    ];
    logger.log(`PostHog sent ${sent.length} event(s): ${names.join(", ")}`);
  });
  client.on("error", (error) => {
    const kind = error instanceof Error ? error.name : typeof error;
    logger.warn(`PostHog delivery failed (${kind}); events may be lost`);
  });
}
