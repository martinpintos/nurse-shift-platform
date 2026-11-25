import { TEST_IDS } from "@repo/shared";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequireRole } from "../../components/RoleRouting";
import type { RouteHandler } from "../../test/fetch-mock";
import {
  admin,
  adminShifts,
  auditEntry,
  outboxMessage,
  shift2,
  submittedTimesheet,
  refs,
} from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { POLL_INTERVAL_MS } from "../../lib/use-polling";
import { AdminView, RESET_CONFIRM_MESSAGE } from "./AdminView";

const FEEDS = [
  "GET /api/admin/shifts",
  "GET /api/admin/audit-log",
  "GET /api/admin/outbox",
  "GET /api/timesheets",
];

function renderAdmin(routes: Record<string, RouteHandler> = {}) {
  return renderApp(
    <RequireRole role="admin">
      <AdminView />
    </RequireRole>,
    {
      user: admin,
      routes: {
        "GET /api/admin/shifts": { shifts: adminShifts, refs },
        "GET /api/admin/audit-log": { entries: [auditEntry], refs },
        "GET /api/admin/outbox": { messages: [outboxMessage], refs },
        "GET /api/timesheets": { timesheets: [submittedTimesheet], refs },
        ...routes,
      },
    },
  );
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function banner() {
  return screen.getByTestId(TEST_IDS.notificationBanner);
}

afterEach(() => {
  // Drop the override so the next test sees jsdom's own (visible) state.
  delete (document as { visibilityState?: unknown }).visibilityState;
});

describe("AdminView", () => {
  it("shows every shift with its status badge, nurse and cancellation history", async () => {
    renderAdmin();
    const table = await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows).toHaveLength(3);
    expect(
      within(table)
        .getAllByTestId(TEST_IDS.adminShiftStatusBadge)
        .map((badge) => badge.textContent),
    ).toEqual(["open", "filled", "open"]);
    expect(within(rows[1]!).getByText("nurse-1")).toBeTruthy();
    // shift-1's history: a no-show by nurse-2, reported by agency-a.
    expect(within(rows[0]!).getByText("No-show")).toBeTruthy();
    expect(within(rows[0]!).getByText("nurse-2")).toBeTruthy();
    expect(within(rows[0]!).getByText("agency-a")).toBeTruthy();

    // Cancel only on the filled row.
    expect(
      within(rows[0]!).queryByTestId(TEST_IDS.shiftCancelButton),
    ).toBeNull();
    expect(
      within(rows[1]!).getAllByTestId(TEST_IDS.shiftCancelButton),
    ).toHaveLength(1);
    expect(
      within(rows[2]!).queryByTestId(TEST_IDS.shiftCancelButton),
    ).toBeNull();

    expect(screen.getByTestId(TEST_IDS.auditLogTable)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.timesheetTable)).toBeTruthy();
    expect(screen.getByText("Your shift was cancelled")).toBeTruthy();
  });

  it("polls every 5 seconds and pauses while the tab is hidden", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { api } = renderAdmin();
    await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);
    const count = (key: string) => api.callsTo(key).length;
    for (const feed of FEEDS) expect(count(feed)).toBe(1);

    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS - 1);
    });
    expect(count("GET /api/admin/shifts")).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    for (const feed of FEEDS) expect(count(feed)).toBe(2);
    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    for (const feed of FEEDS) expect(count(feed)).toBe(3);

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS * 4);
    });
    for (const feed of FEEDS) expect(count(feed)).toBe(3);
    expect(screen.getByText(/paused while this tab is hidden/i)).toBeTruthy();

    // Back in view: refresh at once, then resume the 5 s cadence.
    setVisibility("visible");
    for (const feed of FEEDS) expect(count(feed)).toBe(4);
    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    for (const feed of FEEDS) expect(count(feed)).toBe(5);
  });

  it("does not start polling when it mounts in a hidden tab", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const { api } = renderAdmin();
    await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);

    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS * 3);
    });
    expect(api.callsTo("GET /api/admin/shifts")).toHaveLength(1);
  });

  it("cancels a filled shift with the default no-show reason in one click", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { api } = renderAdmin({
      "POST /api/shifts/shift-2/cancel": {
        ...shift2,
        status: "open",
        claimedBy: null,
        cancellation: { reason: "no-show", previousNurseId: "nurse-1" },
      },
    });
    const table = await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);

    fireEvent.click(within(table).getByTestId(TEST_IDS.shiftCancelButton));

    await waitFor(() => expect(banner().textContent).toBe("Shift cancelled"));
    expect(api.callsTo("POST /api/shifts/shift-2/cancel")[0]?.body).toEqual({
      reason: "no-show",
    });
    expect(confirm).not.toHaveBeenCalled();
    // Every feed refreshes so the history and audit log show the cancellation.
    await waitFor(() =>
      expect(api.callsTo("GET /api/admin/audit-log")).toHaveLength(2),
    );
  });

  it("downloads the license export and confirms it in the banner", async () => {
    const createObjectURL = vi.fn(() => "blob:export");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const { api } = renderAdmin({
      "GET /api/admin/exports/licenses": () =>
        new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition":
              'attachment; filename="shiftpatch-licenses-2026-11-24.zip"',
          },
        }),
    });
    await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);

    fireEvent.click(
      screen.getByRole("button", { name: "Export license documents" }),
    );

    await waitFor(() =>
      expect(banner().textContent).toBe("License export downloaded"),
    );
    expect(api.callsTo("GET /api/admin/exports/licenses")).toHaveLength(1);
    expect(createObjectURL).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("shiftpatch-licenses-2026-11-24.zip");
    click.mockRestore();
  });

  it("resets demo data after a native confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = renderAdmin({
      "POST /api/admin/reset": { status: "reset" },
    });
    await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);

    fireEvent.click(screen.getByRole("button", { name: "Reset demo data" }));

    expect(confirm).toHaveBeenCalledWith(RESET_CONFIRM_MESSAGE);
    await waitFor(() => expect(banner().textContent).toBe("Demo data reset"));
    expect(api.callsTo("POST /api/admin/reset")).toHaveLength(1);
    await waitFor(() =>
      expect(api.callsTo("GET /api/admin/shifts")).toHaveLength(2),
    );
  });

  it("does nothing when the reset is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { api } = renderAdmin();
    await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);

    fireEvent.click(screen.getByRole("button", { name: "Reset demo data" }));

    expect(api.callsTo("POST /api/admin/reset")).toHaveLength(0);
    expect(banner().textContent).toBe("");
  });
});
