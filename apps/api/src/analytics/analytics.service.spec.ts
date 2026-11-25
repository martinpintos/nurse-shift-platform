import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { AnalyticsService, type AnalyticsSink } from "./analytics.service.js";
import { ANALYTICS_EVENTS } from "./analytics.events.js";

function recordingSink() {
  const captured: Parameters<AnalyticsSink["capture"]>[0][] = [];
  const shutdown = vi.fn(async () => undefined);
  const sink: AnalyticsSink = {
    capture: (message) => {
      captured.push(message);
    },
    shutdown,
  };
  return { sink, captured, shutdown };
}

describe("AnalyticsService", () => {
  it("does nothing without POSTHOG_KEY", () => {
    const config = new ConfigService({
      POSTHOG_HOST: "https://us.i.posthog.com",
    });
    const analytics = new AnalyticsService(config as never);
    expect(analytics.enabled).toBe(false);
    expect(() =>
      analytics.capture("user_logged_in", "nurse-1", { role: "nurse" }),
    ).not.toThrow();
  });

  it("sends anonymous events with GeoIP off", () => {
    const { sink, captured } = recordingSink();
    AnalyticsService.withSink(sink).capture("shift_claimed", "nurse-1", {
      shift_id: "shift-1",
      agency_id: "agency-a",
    });
    expect(captured).toEqual([
      {
        distinctId: "nurse-1",
        event: "shift_claimed",
        properties: {
          shift_id: "shift-1",
          agency_id: "agency-a",
          $process_person_profile: false,
        },
        disableGeoip: true,
      },
    ]);
  });

  it("drops an event whose properties step outside the allow-list", () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const { sink, captured } = recordingSink();
    const analytics = AnalyticsService.withSink(sink);
    analytics.capture("user_logged_in", "nurse-1", {
      role: "nurse",
      email: "maria.lopez@example.com",
    } as never);
    analytics.capture("shift_claimed", "nurse-1", {
      shift_id: "shift-1",
      agency_id: "agency-a",
      nurse_name: "Maria Lopez",
    } as never);
    expect(captured).toEqual([]);
    // Logged by event name only, never the values.
    for (const [message] of warn.mock.calls) {
      expect(String(message)).not.toMatch(/maria|lopez|@/i);
    }
    warn.mockRestore();
  });

  it("never fails the request when the client throws", () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const analytics = AnalyticsService.withSink({
      capture: () => {
        throw new Error("network down");
      },
      shutdown: async () => undefined,
    });
    expect(() =>
      analytics.capture("user_logged_in", "admin-1", { role: "admin" }),
    ).not.toThrow();
    warn.mockRestore();
  });

  it("flushes on shutdown", async () => {
    const { sink, shutdown } = recordingSink();
    await AnalyticsService.withSink(sink).onApplicationShutdown();
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it("allows only ids, enums and counts in every event", () => {
    for (const [event, schema] of Object.entries(ANALYTICS_EVENTS)) {
      for (const [key, field] of Object.entries(schema.shape)) {
        const type = (field as { def: { type: string } }).def.type;
        expect(["string", "enum", "number"], `${event}.${key}`).toContain(type);
        expect(key, `${event}.${key}`).not.toMatch(
          /name|email|phone|address|dob|birth|tb|health/i,
        );
      }
    }
  });
});
