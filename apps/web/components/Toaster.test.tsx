import { ERROR_MESSAGES, SUCCESS_MESSAGES, TEST_IDS } from "@repo/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import { NotificationProvider, useNotifications } from "../lib/notifications";
import { useAction } from "../lib/use-action";
import { setPathname } from "../test/router";
import { SUCCESS_TOAST_MS, Toaster } from "./Toaster";

interface Deferred {
  promise: Promise<string>;
  resolve: (value?: string) => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value?: string) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = (value = "result") => res(value);
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A button that runs whatever action the test hands it, like a claim button would. */
function Harness({
  next,
  onApply,
}: {
  next: () => Promise<string>;
  onApply: (result: string, toastShown: boolean) => void;
}) {
  const { run } = useAction();
  return (
    <button
      type="button"
      onClick={() =>
        void run("claim", next, {
          success: SUCCESS_MESSAGES.shiftClaimed,
          apply: (result) =>
            onApply(
              result,
              document.querySelector(
                `[data-testid="${TEST_IDS.notificationBanner}"]`,
              ) !== null,
            ),
        })
      }
    >
      Claim
    </button>
  );
}

function Notify() {
  const { notifyError } = useNotifications();
  return (
    <button
      type="button"
      onClick={() => notifyError("Session expired", { scope: "/login" })}
    >
      Expire
    </button>
  );
}

function setup() {
  const actions: Deferred[] = [];
  const onApply = vi.fn();
  const next = () => {
    const action = deferred();
    actions.push(action);
    return action.promise;
  };
  const view = render(
    <NotificationProvider>
      <Harness next={next} onApply={onApply} />
      <Notify />
      <Toaster />
    </NotificationProvider>,
  );
  const click = () =>
    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
  const toasts = () => screen.queryAllByTestId(TEST_IDS.notificationBanner);
  const rerender = () =>
    view.rerender(
      <NotificationProvider>
        <Harness next={next} onApply={onApply} />
        <Notify />
        <Toaster />
      </NotificationProvider>,
    );
  return { actions, click, toasts, onApply, rerender };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("Toaster", () => {
  it("renders no toast until an action finishes, inside an always-present live region", () => {
    const { toasts } = setup();
    expect(toasts()).toHaveLength(0);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("shows success and error under the same test ID, one at a time, distinguished by content", async () => {
    const { actions, click, toasts } = setup();

    click();
    await act(async () => actions[0]?.resolve());
    const first = screen.getByTestId(TEST_IDS.notificationBanner);
    expect(first.textContent).toBe("Shift claimed");
    expect(first.dataset.variant).toBe("success");
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "Shift claimed",
    );

    click();
    await act(async () =>
      actions[1]?.reject(new ApiError(403, ERROR_MESSAGES.credentialExpired)),
    );
    expect(toasts()).toHaveLength(1);
    const second = screen.getByTestId(TEST_IDS.notificationBanner);
    // A new toast replaces the old one: a new node, so it is announced again.
    expect(second).not.toBe(first);
    expect(second.textContent).toBe("Credential expired, cannot claim shift");
    expect(second.dataset.variant).toBe("error");
  });

  it("applies the API's result before showing the success toast", async () => {
    const { actions, click, onApply } = setup();
    click();
    await act(async () => actions[0]?.resolve("updated shift"));
    expect(onApply).toHaveBeenCalledWith("updated shift", false);
    expect(screen.getByTestId(TEST_IDS.notificationBanner)).toBeTruthy();
  });

  it("dismisses a success toast after about 6 seconds", async () => {
    vi.useFakeTimers();
    const { actions, click, toasts } = setup();
    click();
    await act(async () => actions[0]?.resolve());

    await advance(SUCCESS_TOAST_MS - 100);
    expect(toasts()).toHaveLength(1);
    await advance(200);
    expect(toasts()).toHaveLength(0);
  });

  it("pauses the countdown while hovered and resumes with the time left", async () => {
    vi.useFakeTimers();
    const { actions, click, toasts } = setup();
    click();
    await act(async () => actions[0]?.resolve());

    await advance(4000);
    fireEvent.mouseEnter(screen.getByTestId(TEST_IDS.notificationBanner));
    await advance(60_000);
    expect(toasts()).toHaveLength(1);

    fireEvent.mouseLeave(screen.getByTestId(TEST_IDS.notificationBanner));
    await advance(1900);
    expect(toasts()).toHaveLength(1);
    await advance(200);
    expect(toasts()).toHaveLength(0);
  });

  it("pauses while focus is inside it (keyboard users reaching the dismiss button)", async () => {
    vi.useFakeTimers();
    const { actions, click, toasts } = setup();
    click();
    await act(async () => actions[0]?.resolve());

    fireEvent.focus(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    await advance(60_000);
    expect(toasts()).toHaveLength(1);
  });

  it("keeps an error until it is dismissed", async () => {
    vi.useFakeTimers();
    const { actions, click, toasts } = setup();
    click();
    await act(async () =>
      actions[0]?.reject(new ApiError(409, ERROR_MESSAGES.shiftAlreadyFilled)),
    );

    await advance(10 * 60 * 1000);
    expect(toasts()).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(toasts()).toHaveLength(0);
  });

  it("drops the toast on a route change", async () => {
    const { actions, click, toasts, rerender } = setup();
    click();
    await act(async () =>
      actions[0]?.reject(new ApiError(409, ERROR_MESSAGES.shiftAlreadyFilled)),
    );
    expect(toasts()).toHaveLength(1);

    setPathname("/agency");
    rerender();
    expect(toasts()).toHaveLength(0);

    // Going back doesn't bring it back.
    setPathname("/");
    rerender();
    expect(toasts()).toHaveLength(0);
  });

  it("holds a toast scoped to another route until that route is shown", () => {
    const { toasts, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Expire" }));
    expect(toasts()).toHaveLength(0);

    setPathname("/login");
    rerender();
    expect(screen.getByTestId(TEST_IDS.notificationBanner).textContent).toBe(
      "Session expired",
    );
  });
});
