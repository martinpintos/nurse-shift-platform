import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../common/clock.js";

/** Failed sign-ins allowed within the window, per IP and email, and per IP. */
export const LOGIN_THROTTLE = {
  windowMs: 15 * 60 * 1000,
  maxPerAccount: 10,
  maxPerIp: 30,
  /** Bounds memory: past this many keys, the least recently failed are dropped. */
  maxKeys: 50_000,
} as const;

/** Longest email worth keying on (RFC 5321), so a huge body can't make a huge key. */
const MAX_EMAIL_LENGTH = 320;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * In-memory login throttle that counts failed attempts only, in a sliding window. Once a
 * key is over its limit, every attempt for it gets 429 before the password is checked, a
 * correct one included, until old failures leave the window. A successful sign-in clears
 * its IP+email counter but not the IP's, so knowing one password doesn't reset the IP.
 *
 * One instance per process: with several API replicas each counts on its own.
 */
@Injectable()
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(@Inject(Clock) private readonly clock: Clock) {}

  isBlocked(ip: string, email: string): boolean {
    const now = this.clock.now().getTime();
    return (
      this.recent(accountKey(ip, email), now).length >=
        LOGIN_THROTTLE.maxPerAccount ||
      this.recent(ipKey(ip), now).length >= LOGIN_THROTTLE.maxPerIp
    );
  }

  recordFailure(ip: string, email: string): void {
    const now = this.clock.now().getTime();
    this.push(accountKey(ip, email), now, LOGIN_THROTTLE.maxPerAccount);
    this.push(ipKey(ip), now, LOGIN_THROTTLE.maxPerIp);
    this.bound();
  }

  recordSuccess(ip: string, email: string): void {
    this.failures.delete(accountKey(ip, email));
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

function ipKey(ip: string): string {
  return `ip\u0000${ip}`;
}

function accountKey(ip: string, email: string): string {
  return `account\u0000${ip}\u0000${normalizeEmail(email).slice(0, MAX_EMAIL_LENGTH)}`;
}
