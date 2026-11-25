import { Clock } from "../common/clock.js";
import {
  LOGIN_THROTTLE,
  LoginThrottle,
  normalizeEmail,
} from "./login-throttle.js";

class FakeClock extends Clock {
  at = Date.UTC(2026, 10, 24, 12, 0, 0);
  override now(): Date {
    return new Date(this.at);
  }
}

function setup() {
  const clock = new FakeClock();
  return { clock, throttle: new LoginThrottle(clock) };
}

function fail(
  throttle: LoginThrottle,
  times: number,
  ip: string,
  email: string,
): void {
  for (let i = 0; i < times; i++) throttle.recordFailure(ip, email);
}

describe("LoginThrottle", () => {
  it("blocks an IP and email after 10 failures, not before", () => {
    const { throttle } = setup();
    fail(
      throttle,
      LOGIN_THROTTLE.maxPerAccount - 1,
      "1.1.1.1",
      "a@example.com",
    );
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(false);
    throttle.recordFailure("1.1.1.1", "a@example.com");
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(true);
    expect(throttle.isBlocked("1.1.1.1", "b@example.com")).toBe(false);
    expect(throttle.isBlocked("2.2.2.2", "a@example.com")).toBe(false);
  });

  it("treats emails case- and space-insensitively", () => {
    const { throttle } = setup();
    fail(throttle, LOGIN_THROTTLE.maxPerAccount, "1.1.1.1", " A@Example.com");
    expect(throttle.isBlocked("1.1.1.1", "a@example.com ")).toBe(true);
  });

  it("blocks an IP after 30 failures across emails", () => {
    const { throttle } = setup();
    for (let i = 0; i < LOGIN_THROTTLE.maxPerIp - 1; i++) {
      throttle.recordFailure("1.1.1.1", `user-${i}@example.com`);
    }
    expect(throttle.isBlocked("1.1.1.1", "new@example.com")).toBe(false);
    throttle.recordFailure("1.1.1.1", "last@example.com");
    expect(throttle.isBlocked("1.1.1.1", "new@example.com")).toBe(true);
    expect(throttle.isBlocked("2.2.2.2", "new@example.com")).toBe(false);
  });

  it("forgets failures once they leave the 15-minute window", () => {
    const { clock, throttle } = setup();
    fail(throttle, LOGIN_THROTTLE.maxPerAccount, "1.1.1.1", "a@example.com");
    clock.at += LOGIN_THROTTLE.windowMs - 1;
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(true);
    clock.at += 1;
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(false);
    expect(throttle.size).toBe(0);
  });

  it("is a sliding window: only the failures within the last 15 minutes count", () => {
    const { clock, throttle } = setup();
    fail(throttle, 5, "1.1.1.1", "a@example.com");
    clock.at += 10 * 60 * 1000;
    fail(throttle, 5, "1.1.1.1", "a@example.com");
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(true);
    clock.at += 5 * 60 * 1000;
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(false);
  });

  it("clears the IP+email counter on success, but not the IP's", () => {
    const { throttle } = setup();
    fail(throttle, LOGIN_THROTTLE.maxPerAccount, "1.1.1.1", "a@example.com");
    fail(
      throttle,
      LOGIN_THROTTLE.maxPerIp - LOGIN_THROTTLE.maxPerAccount,
      "1.1.1.1",
      "b@example.com",
    );
    throttle.recordSuccess("1.1.1.1", "a@example.com");
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(true);
    expect(throttle.isBlocked("1.1.1.1", "c@example.com")).toBe(true);
  });

  it("success alone never blocks", () => {
    const { throttle } = setup();
    for (let i = 0; i < 100; i++)
      throttle.recordSuccess("1.1.1.1", "a@example.com");
    expect(throttle.isBlocked("1.1.1.1", "a@example.com")).toBe(false);
  });

  it("bounds its memory, dropping the least recently failed keys first", () => {
    const { throttle } = setup();
    fail(
      throttle,
      LOGIN_THROTTLE.maxPerAccount,
      "192.0.2.1",
      "target@example.com",
    );
    // Each failure from a new IP adds two keys (IP, and IP+email).
    for (let i = 0; i < LOGIN_THROTTLE.maxKeys; i++) {
      throttle.recordFailure(
        `10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`,
        "a@example.com",
      );
    }
    expect(throttle.size).toBeLessThanOrEqual(LOGIN_THROTTLE.maxKeys);
    expect(throttle.isBlocked("192.0.2.1", "target@example.com")).toBe(false);
    // The newest keys are kept, and their counters still work.
    fail(
      throttle,
      LOGIN_THROTTLE.maxPerAccount - 1,
      "10.0.195.79",
      "a@example.com",
    );
    expect(throttle.isBlocked("10.0.195.79", "a@example.com")).toBe(true);
  });

  it("normalizes emails by trimming and lowercasing", () => {
    expect(normalizeEmail("  Maria.Lopez@Example.COM ")).toBe(
      "maria.lopez@example.com",
    );
  });
});
