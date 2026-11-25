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

function fail(throttle: LoginThrottle, times: number, email: string): void {
  for (let i = 0; i < times; i++) throttle.recordFailure(email);
}

describe("LoginThrottle", () => {
  it("blocks an account after 10 failures, not before", () => {
    const { throttle } = setup();
    fail(throttle, LOGIN_THROTTLE.maxPerAccount - 1, "a@example.com");
    expect(throttle.isBlocked("a@example.com")).toBe(false);
    throttle.recordFailure("a@example.com");
    expect(throttle.isBlocked("a@example.com")).toBe(true);
    expect(throttle.isBlocked("b@example.com")).toBe(false);
  });

  it("treats case and surrounding spaces as the same account", () => {
    const { throttle } = setup();
    fail(throttle, LOGIN_THROTTLE.maxPerAccount, " A@Example.com");
    expect(throttle.isBlocked("a@example.com ")).toBe(true);
    expect(normalizeEmail("  Maria@EXAMPLE.com ")).toBe("maria@example.com");
  });

  it("lets failures leave the window one by one (sliding)", () => {
    const { clock, throttle } = setup();
    throttle.recordFailure("a@example.com");
    clock.at += 60_000;
    fail(throttle, LOGIN_THROTTLE.maxPerAccount - 1, "a@example.com");
    expect(throttle.isBlocked("a@example.com")).toBe(true);
    // The first failure ages out; nine remain.
    clock.at += LOGIN_THROTTLE.windowMs - 60_000;
    expect(throttle.isBlocked("a@example.com")).toBe(false);
  });

  it("unblocks once the whole window has passed", () => {
    const { clock, throttle } = setup();
    fail(throttle, LOGIN_THROTTLE.maxPerAccount, "a@example.com");
    clock.at += LOGIN_THROTTLE.windowMs - 1;
    expect(throttle.isBlocked("a@example.com")).toBe(true);
    clock.at += 1;
    expect(throttle.isBlocked("a@example.com")).toBe(false);
  });

  it("a success clears the account's counter", () => {
    const { throttle } = setup();
    fail(throttle, LOGIN_THROTTLE.maxPerAccount - 1, "a@example.com");
    throttle.recordSuccess("a@example.com");
    fail(throttle, LOGIN_THROTTLE.maxPerAccount - 1, "a@example.com");
    expect(throttle.isBlocked("a@example.com")).toBe(false);
  });

  it("caps a very long email so a huge body can't make a huge key", () => {
    const { throttle } = setup();
    const long = `${"x".repeat(400)}@example.com`;
    fail(throttle, LOGIN_THROTTLE.maxPerAccount, long);
    // Same first 320 characters, same account.
    expect(throttle.isBlocked(`${"x".repeat(400)}@other.example`)).toBe(true);
  });

  it("bounds memory under a flood of distinct emails", () => {
    const { throttle } = setup();
    for (let i = 0; i < LOGIN_THROTTLE.maxKeys + 10; i++) {
      throttle.recordFailure(`user-${i}@example.com`);
    }
    expect(throttle.size).toBeLessThanOrEqual(LOGIN_THROTTLE.maxKeys);
    // The most recent account is still tracked.
    fail(
      throttle,
      LOGIN_THROTTLE.maxPerAccount - 1,
      `user-${LOGIN_THROTTLE.maxKeys + 9}@example.com`,
    );
    expect(
      throttle.isBlocked(`user-${LOGIN_THROTTLE.maxKeys + 9}@example.com`),
    ).toBe(true);
  });
});
