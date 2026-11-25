import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("next/navigation", async () => {
  const { router, pathname } = await import("./router");
  return { useRouter: () => router, usePathname: () => pathname.current };
});

// jsdom has no layout, so no scrollIntoView; browsers always do.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no <dialog> modality; open and close it as attributes.
if (
  typeof HTMLDialogElement !== "undefined" &&
  !HTMLDialogElement.prototype.showModal
) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(async () => {
  cleanup();
  const { setPathname } = await import("./router");
  setPathname("/");
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // Config tests run in the node environment, without a window.
  if (typeof window !== "undefined") window.sessionStorage.clear();
});
