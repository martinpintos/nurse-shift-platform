import { vi, type Mock } from "vitest";

type RouterMethod =
  "push" | "replace" | "refresh" | "back" | "forward" | "prefetch";

/** One stable router object, like Next's, so effects that depend on it don't re-run. */
export const router: Record<RouterMethod, Mock> = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

/** The pathname `usePathname()` returns. Tests set it to simulate a route change. */
export const pathname = { current: "/" };

export function setPathname(next: string): void {
  pathname.current = next;
}
