import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../common/clock.js";

/** Failed sign-ins allowed per account (email) within the window, from any IP. */
export const LOGIN_THROTTLE = {
  windowMs: 15 * 60 * 1000,
  maxPerAccount: 10,
  /** Bounds memory: past this many keys, the least recently failed are dropped. */
  maxKeys: 50_000,
} as const;

/** Longest email worth keying on (RFC 5321), so a huge body can't make a huge key. */
const MAX_EMAIL_LENGTH = 320;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * In-memory login throttle, per account: it counts failed attempts for an email in a
 * sliding window, whatever IP they come from. Behind Vercel and Railway the API can't
 * see a trustworthy client IP (every request arrives from a different proxy address), so
 * keying on the account is what actually stops password guessing.
 *
 * Once an email is over the limit, every attempt for it gets 429 before the password is
 * checked, a correct one included, until old failures leave the window. The trade-off,
 * accepted for this product: anyone can hold an account's sign-in for up to 15 minutes.
 * A successful sign-in clears the account's counter.
 *
 * One instance per process: with several API replicas each counts on its own.
 */
@Injectable()
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(@Inject(Clock) private readonly clock: Clock) {}

  isBlocked(email: string): boolean {
    const now = this.clock.now().getTime();
    return (
      this.recent(accountKey(email), now).length >= LOGIN_THROTTLE.maxPerAccount
    );
  }

  recordFailure(email: string): void {
    const now = this.clock.now().getTime();
    this.push(accountKey(email), now, LOGIN_THROTTLE.maxPerAccount);
    this.bound();
  }

  recordSuccess(email: string): void {
    this.failures.delete(accountKey(email));
  }

  /** Number of keys held, for tests. */
  get size(): number {
    return this.failures.size;
  }

  private recent(key: string, now: number): number[] {
    const times = this.failures.get(key);
    if (!times) return [];
    const live = times.filter((at) => now - at < LOGIN_THROTTLE.windowMs);
    if (live.length === 0) {
      this.failures.delete(key);
    } else if (live.length !== times.length) {
      this.failures.set(key, live);
    }
    return live;
  }

  /** Keeps only the newest `limit` timestamps: older ones can't change the decision. */
  private push(key: string, now: number, limit: number): void {
    const times = [...this.recent(key, now), now].slice(-limit);
    // Re-insert so Map order is least recently failed first, for eviction.
    this.failures.delete(key);
    this.failures.set(key, times);
  }

  /**
   * Map order is least recently failed first (`push` re-inserts), so expired keys sit at
   * the front. Past the limit, drop keys from the front down to 90% of it: constant work
   * per failure on average, however many keys an attacker creates.
   */
  private bound(): void {
    if (this.failures.size <= LOGIN_THROTTLE.maxKeys) return;
    const target = Math.floor(LOGIN_THROTTLE.maxKeys * 0.9);
    // Deleting from a Map while iterating it is safe.
    for (const key of this.failures.keys()) {
      if (this.failures.size <= target) break;
      this.failures.delete(key);
    }
  }
}

function accountKey(email: string): string {
  return normalizeEmail(email).slice(0, MAX_EMAIL_LENGTH);
}
