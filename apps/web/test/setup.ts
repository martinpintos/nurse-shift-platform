import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("next/navigation", async () => {
  const { router } = await import("./router");
  return { useRouter: () => router };
});

// jsdom has no layout, so no scrollIntoView; browsers always do.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // Config tests run in the node environment, without a window.
  if (typeof window !== "undefined") window.sessionStorage.clear();
});
