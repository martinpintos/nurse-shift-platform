import { ERROR_MESSAGES, SUCCESS_MESSAGES, TEST_IDS } from "@repo/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import { NotificationProvider } from "../lib/notifications";
import { useAction } from "../lib/use-action";
import { NotificationBanner } from "./NotificationBanner";

interface Deferred {
  promise: Promise<unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = () => res(undefined);
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A button that runs whatever action the test hands it, like a claim button would. */
function Harness({ next }: { next: () => Promise<unknown> }) {
  const { run } = useAction();
  return (
    <>
      <NotificationBanner />
      <button
        type="button"
        onClick={() => void run("claim", next, SUCCESS_MESSAGES.shiftClaimed)}
      >
        Claim
      </button>
    </>
  );
}

function setup() {
  const actions: Deferred[] = [];
  const next = () => {
    const action = deferred();
    actions.push(action);
    return action.promise;
  };
  render(
    <NotificationProvider>
      <Harness next={next} />
    </NotificationProvider>,
  );
  const click = () =>
    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
  return { actions, click };
}

describe("NotificationBanner", () => {
  it("is an always-present polite status region, empty until an action finishes", () => {
    setup();
    const banner = screen.getByTestId(TEST_IDS.notificationBanner);
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.textContent).toBe("");
    expect(banner.hasAttribute("data-variant")).toBe(false);
  });

  it("shows success and error text under the same test ID, distinguished by content", async () => {
    const { actions, click } = setup();
    const banner = screen.getByTestId(TEST_IDS.notificationBanner);

    click();
    await act(async () => actions[0]?.resolve());
    expect(banner.textContent).toBe("Shift claimed");
    expect(banner.dataset.variant).toBe("success");

    click();
    await act(async () =>
      actions[1]?.reject(new ApiError(403, ERROR_MESSAGES.credentialExpired)),
    );
    // Same element, same test ID: only the content and variant change.
    expect(screen.getByTestId(TEST_IDS.notificationBanner)).toBe(banner);
    expect(banner.textContent).toBe("Credential expired, cannot claim shift");
    expect(banner.dataset.variant).toBe("error");
    expect(screen.getAllByTestId(TEST_IDS.notificationBanner)).toHaveLength(1);
  });

  it("stays visible with no auto-dismiss until the next action's result replaces it", async () => {
    vi.useFakeTimers();
    const { actions, click } = setup();
    const banner = screen.getByTestId(TEST_IDS.notificationBanner);

    click();
    await act(async () => actions[0]?.resolve());
    expect(banner.textContent).toBe("Shift claimed");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(banner.textContent).toBe("Shift claimed");

    // The next action is in flight: the previous result is still shown.
    click();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(banner.textContent).toBe("Shift claimed");

    await act(async () =>
      actions[1]?.reject(new ApiError(409, ERROR_MESSAGES.shiftAlreadyFilled)),
    );
    expect(banner.textContent).toBe("Shift already filled");
  });

  it("re-renders a repeated message as a new node so it is announced again", async () => {
    const { actions, click } = setup();
    const banner = screen.getByTestId(TEST_IDS.notificationBanner);

    click();
    await act(async () => actions[0]?.resolve());
    const first = banner.firstElementChild;

    click();
    await act(async () => actions[1]?.resolve());
    expect(banner.textContent).toBe("Shift claimed");
    expect(banner.firstElementChild).not.toBe(first);
  });
});
