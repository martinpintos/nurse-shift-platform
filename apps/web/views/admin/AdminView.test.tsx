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
import {
  errorResponse,
  jsonResponse,
  type RouteHandler,
} from "../../test/fetch-mock";
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
    // Names, not ids; the shift id stays as secondary detail.
    expect(within(rows[1]!).getByText("Maria Lopez")).toBeTruthy();
    expect(within(rows[1]!).queryByText("nurse-1")).toBeNull();
    expect(within(rows[1]!).getByText("shift-2")).toBeTruthy();
    // shift-1's history: one no-show.
    expect(within(rows[0]!).getByText("1 no-show")).toBeTruthy();

    // Open shifts and shifts with a submitted timesheet cannot be cancelled.
    expect(
      within(rows[0]!).queryByTestId(TEST_IDS.shiftCancelButton),
    ).toBeNull();
    expect(
      within(rows[1]!).queryByTestId(TEST_IDS.shiftCancelButton),
    ).toBeNull();
    expect(within(rows[1]!).getByText("Timesheet submitted")).toBeTruthy();
    expect(
      within(rows[2]!).queryByTestId(TEST_IDS.shiftCancelButton),
    ).toBeNull();

    expect(screen.getByTestId(TEST_IDS.timesheetTable)).toBeTruthy();
    expect(screen.getByText("Your shift was cancelled")).toBeTruthy();
  });

  it("emphasizes names, roles and agencies in the audit log", async () => {
    renderAdmin();
    const log = await screen.findByTestId(TEST_IDS.auditLogTable);
    expect(within(log).getByText("Shift cancelled")).toBeTruthy();
    const [, description] = within(log).getAllByRole("cell");
    expect(description?.textContent).toBe(
      "Sunrise Health Staffing reported James Cook as a no-show on shift-1, RN at Sunrise Health Staffing",
    );
    expect(
      [...description!.querySelectorAll("strong")].map(
        (part) => part.textContent,
      ),
    ).toEqual([
      "Sunrise Health Staffing",
      "James Cook",
      "RN",
      "Sunrise Health Staffing",
    ]);
    expect(within(log).queryByText(/nurse-2|agency-a/)).toBeNull();
    // A relative time, with the full date on hover.
    const time = log.querySelector("time");
    expect(time?.getAttribute("title")).toMatch(/2026/);
  });

  it("shows outbox subjects with a secondary shift reference and emphasizes the recipient name", async () => {
    renderAdmin({
      "GET /api/admin/outbox": {
        messages: [
          {
            ...outboxMessage,
            template: "shift.claimed",
            subject: "You claimed shift shift-1",
          },
          {
            ...outboxMessage,
            id: "out-2",
            template: "shift.claimed",
            subject: "Shift shift-1 was claimed",
            recipientId: "agency-a",
            recipientEmail: "admin@sunrisehealth.example",
          },
        ],
        refs,
      },
    });
    const list = await screen.findByRole("list", { name: /Notifications/ });
    const [toNurse, toAgency] = within(list).getAllByRole("listitem");
    expect(toNurse?.textContent).toContain("You claimed a shift (shift-1)");
    expect(toAgency?.textContent).toContain("Shift claimed (shift-1)");
    expect(within(toNurse!).getByText("James Cook").tagName).toBe("STRONG");
    expect(
      within(toNurse!).getByText(outboxMessage.recipientEmail).tagName,
    ).toBe("SPAN");
    expect(within(toAgency!).getByText("Sunrise Health Staffing").tagName).toBe(
      "STRONG",
    );
  });

  it("leads with coverage KPIs computed from the shifts", async () => {
    renderAdmin();
    const kpis = await screen.findByLabelText("Coverage summary");
    // Seed: shift-1 and shift-3 open, shift-2 filled; one no-show on shift-1.
    expect(kpis.textContent).toContain("Needs coverage2");
    expect(kpis.textContent).toContain("Filled1");
    expect(kpis.textContent).toContain("Coverage rate33%");
    expect(kpis.textContent).toContain("Cancellations1");
    expect(kpis.textContent).toContain("Timesheets pending1");
  });

  it("filters by agency and status tab, with counts that follow the filter", async () => {
    renderAdmin();
    const table = await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);
    fireEvent.change(screen.getByLabelText("Agency"), {
      target: { value: "agency-b" },
    });
    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(1);
    expect(
      screen.getByRole("tab", { name: /Needs coverage/ }).textContent,
    ).toBe("Needs coverage1");

    fireEvent.click(screen.getByRole("tab", { name: /Filled/ }));
    expect(within(table).getByText("No shifts in this view.")).toBeTruthy();
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
    expect(screen.getByText("Updates paused")).toBeTruthy();

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

  it("keeps connecting while an initial server error gets one quick retry", async () => {
    let attempts = 0;
    let resolveRetry!: (response: Response) => void;
    const retryResponse = new Promise<Response>((resolve) => {
      resolveRetry = resolve;
    });
    const { api } = renderAdmin({
      "GET /api/admin/shifts": () => {
        attempts += 1;
        return attempts === 1
          ? errorResponse(500, "Internal server error")
          : retryResponse;
      },
    });

    await waitFor(() =>
      expect(api.callsTo("GET /api/admin/shifts")).toHaveLength(2),
    );
    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.queryByText("Updates delayed")).toBeNull();
    expect(screen.queryByText(/Internal server error/)).toBeNull();

    await act(async () =>
      resolveRetry(jsonResponse({ shifts: adminShifts, refs })),
    );
    expect(await screen.findByText("Live", { exact: true })).toBeTruthy();
  });

  it("keeps the last coverage data visible when a refresh fails and returns to Live on recovery", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { api } = renderAdmin();
    await screen.findByText("Live", { exact: true });
    const table = screen.getByTestId(TEST_IDS.adminDashboardShiftTable);

    api.set("GET /api/admin/shifts", () =>
      errorResponse(503, "Feed unavailable"),
    );
    await act(async () => vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(await screen.findByText("Updates delayed")).toBeTruthy();
    expect(api.callsTo("GET /api/admin/shifts")).toHaveLength(3);
    expect(screen.getByText(/Coverage last updated/)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.adminDashboardShiftTable)).toBe(table);

    api.set("GET /api/admin/shifts", { shifts: adminShifts, refs });
    await act(async () => vi.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(await screen.findByText("Live", { exact: true })).toBeTruthy();
    expect(screen.queryByText(/Coverage last updated/)).toBeNull();
  });

  it("cancels a filled shift with the default no-show reason in one click", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { api } = renderAdmin({
      "GET /api/admin/shifts": {
        shifts: adminShifts.map((shift) => ({
          ...shift,
          timesheetStatus: null,
        })),
        refs,
      },
      "GET /api/timesheets": { timesheets: [], refs },
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
    // The reopened shift from the response updates the row before the toast.
    const badges = within(table).getAllByTestId(TEST_IDS.adminShiftStatusBadge);
    expect(badges.map((badge) => badge.textContent)).toEqual([
      "open",
      "open",
      "open",
    ]);
    expect(within(table).queryByTestId(TEST_IDS.shiftCancelButton)).toBeNull();
    // The audit log and outbox refresh to show the cancellation.
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

  it("resets demo data after confirming in the in-app dialog, never window.confirm", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { api } = renderAdmin({
      "POST /api/admin/reset": { status: "reset" },
    });
    await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);

    fireEvent.click(screen.getByRole("button", { name: "Reset demo data" }));
    const dialog = screen.getByRole("dialog", { name: "Reset demo data?" });
    expect(dialog.textContent).toContain(RESET_CONFIRM_MESSAGE);
    expect(api.callsTo("POST /api/admin/reset")).toHaveLength(0);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset demo data" }),
    );

    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(banner().textContent).toBe("Demo data reset"));
    expect(api.callsTo("POST /api/admin/reset")).toHaveLength(1);
    await waitFor(() =>
      expect(api.callsTo("GET /api/admin/shifts")).toHaveLength(2),
    );
  });

  it("does nothing when the reset is not confirmed", async () => {
    const { api } = renderAdmin();
    await screen.findByTestId(TEST_IDS.adminDashboardShiftTable);

    fireEvent.click(screen.getByRole("button", { name: "Reset demo data" }));
    const dialog = screen.getByRole("dialog", { name: "Reset demo data?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep data" }));

    expect(dialog.hasAttribute("open")).toBe(false);
    expect(api.callsTo("POST /api/admin/reset")).toHaveLength(0);
    expect(screen.queryByTestId(TEST_IDS.notificationBanner)).toBeNull();
  });
});
