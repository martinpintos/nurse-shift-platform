import { ERROR_MESSAGES, TEST_IDS } from "@repo/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequireRole } from "../../components/RoleRouting";
import {
  errorResponse,
  jsonResponse,
  type RouteHandler,
} from "../../test/fetch-mock";
import {
  agency,
  shift1,
  shift2,
  submittedTimesheet,
  refs,
} from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { tomorrowIsoDate } from "../../lib/format";
import { AgencyView } from "./AgencyView";
import { defaultShiftRequest } from "./PostShiftForm";

function renderAgency(routes: Record<string, RouteHandler> = {}) {
  return renderApp(
    <RequireRole role="agency">
      <AgencyView />
    </RequireRole>,
    {
      user: agency,
      routes: {
        "GET /api/agencies/agency-a/shifts": {
          agencyId: "agency-a",
          shifts: [shift1, shift2],
        },
        "GET /api/timesheets": { timesheets: [submittedTimesheet], refs },
        ...routes,
      },
    },
  );
}

function banner() {
  return screen.getByTestId(TEST_IDS.notificationBanner);
}

async function shiftTable() {
  return within(
    await screen.findByRole("region", { name: "Your shifts table" }),
  ).getByRole("table");
}

describe("post-shift defaults", () => {
  it("are RN, tomorrow, 07:00 to 19:00", () => {
    expect(defaultShiftRequest(new Date(2026, 10, 24, 15, 0))).toEqual({
      role: "RN",
      date: "2026-11-25",
      startTime: "07:00",
      endTime: "19:00",
    });
  });

  it("roll tomorrow over month and year ends in local time", () => {
    expect(tomorrowIsoDate(new Date(2026, 11, 31, 23, 30))).toBe("2027-01-01");
    expect(tomorrowIsoDate(new Date(2028, 1, 28, 8, 0))).toBe("2028-02-29");
  });
});

describe("AgencyView", () => {
  it("loads its own shifts with the agencyId from /me", async () => {
    const { api } = renderAgency();
    await shiftTable();
    expect(api.callsTo("GET /api/agencies/agency-a/shifts")).toHaveLength(1);
  });

  it("posts a shift with valid defaults: open the form, then one click on submit", async () => {
    const tomorrow = tomorrowIsoDate();
    const posted = {
      ...shift1,
      id: "shift-7",
      date: tomorrow,
      startTime: "07:00",
      endTime: "19:00",
    };
    const { api } = renderAgency({
      "POST /api/shifts": () => jsonResponse(posted, 201),
    });
    await shiftTable();

    const opener = screen.getByTestId(TEST_IDS.agencyPostShiftButton);
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByTestId(TEST_IDS.agencyPostShiftSubmitButton),
    ).toBeNull();

    fireEvent.click(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    // Every field is labeled and pre-filled.
    expect((screen.getByLabelText("Role") as HTMLSelectElement).value).toBe(
      "RN",
    );
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(
      tomorrow,
    );
    expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe(
      "07:00",
    );
    expect((screen.getByLabelText("End") as HTMLInputElement).value).toBe(
      "19:00",
    );

    api.set("GET /api/agencies/agency-a/shifts", {
      agencyId: "agency-a",
      shifts: [shift1, shift2, posted],
    });
    fireEvent.click(screen.getByTestId(TEST_IDS.agencyPostShiftSubmitButton));

    await waitFor(() => expect(banner().textContent).toBe("Shift posted"));
    expect(banner().dataset.variant).toBe("success");
    expect(api.callsTo("POST /api/shifts")[0]?.body).toEqual({
      role: "RN",
      date: tomorrow,
      startTime: "07:00",
      endTime: "19:00",
    });
    expect(await screen.findByText("shift-7")).toBeTruthy();
  });

  it("keeps the form open after posting, and the opener never closes it", async () => {
    renderAgency({ "POST /api/shifts": () => jsonResponse(shift1, 201) });
    await shiftTable();

    fireEvent.click(screen.getByTestId(TEST_IDS.agencyPostShiftButton));
    fireEvent.click(screen.getByTestId(TEST_IDS.agencyPostShiftButton));
    fireEvent.click(screen.getByTestId(TEST_IDS.agencyPostShiftSubmitButton));
    await waitFor(() => expect(banner().textContent).toBe("Shift posted"));

    expect(
      screen.getByTestId(TEST_IDS.agencyPostShiftSubmitButton),
    ).toBeTruthy();
  });

  it("shows a refused post's API error verbatim", async () => {
    renderAgency({
      "POST /api/shifts": () => errorResponse(403, ERROR_MESSAGES.forbidden),
    });
    await shiftTable();
    fireEvent.click(screen.getByTestId(TEST_IDS.agencyPostShiftButton));
    fireEvent.click(screen.getByTestId(TEST_IDS.agencyPostShiftSubmitButton));

    await waitFor(() =>
      expect(banner().textContent).toBe(
        "You do not have permission to do that",
      ),
    );
    expect(banner().dataset.variant).toBe("error");
  });

  it("offers cancel only on filled shifts, defaulting to no-show, with one click", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { api } = renderAgency({
      "POST /api/shifts/shift-2/cancel": {
        ...shift2,
        status: "open",
        claimedBy: null,
        cancellation: { reason: "no-show", previousNurseId: "nurse-1" },
      },
    });
    const table = await shiftTable();
    const [openRow, filledRow] = within(table).getAllByRole("row").slice(1);

    expect(
      within(openRow!).queryByTestId(TEST_IDS.shiftCancelButton),
    ).toBeNull();
    expect(
      within(filledRow!).getAllByTestId(TEST_IDS.shiftCancelButton),
    ).toHaveLength(1);
    const reason = within(filledRow!).getByRole(
      "combobox",
    ) as HTMLSelectElement;
    expect(reason.value).toBe("no-show");
    expect([...reason.options].map((option) => option.value)).toEqual([
      "no-show",
      "advance",
    ]);

    fireEvent.click(within(filledRow!).getByTestId(TEST_IDS.shiftCancelButton));

    await waitFor(() => expect(banner().textContent).toBe("Shift cancelled"));
    expect(api.callsTo("POST /api/shifts/shift-2/cancel")[0]?.body).toEqual({
      reason: "no-show",
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends the reason picked in the select", async () => {
    const { api } = renderAgency({
      "POST /api/shifts/shift-2/cancel": {
        ...shift2,
        status: "open",
        claimedBy: null,
        cancellation: { reason: "advance", previousNurseId: "nurse-1" },
      },
    });
    const table = await shiftTable();
    fireEvent.change(within(table).getByRole("combobox"), {
      target: { value: "advance" },
    });
    fireEvent.click(within(table).getByTestId(TEST_IDS.shiftCancelButton));

    await waitFor(() => expect(banner().textContent).toBe("Shift cancelled"));
    expect(api.callsTo("POST /api/shifts/shift-2/cancel")[0]?.body).toEqual({
      reason: "advance",
    });
  });

  it("approves a submitted timesheet", async () => {
    const { api } = renderAgency({
      "POST /api/timesheets/ts-1/approve": {
        ...submittedTimesheet,
        status: "approved",
        approvedAt: "2026-11-24T13:00:00.000Z",
        approvedBy: "agency-a",
      },
    });
    const table = await screen.findByTestId(TEST_IDS.timesheetTable);

    fireEvent.click(
      within(table).getByRole("button", {
        name: "Approve timesheet for shift-2",
      }),
    );

    await waitFor(() =>
      expect(banner().textContent).toBe("Timesheet approved"),
    );
    expect(api.callsTo("POST /api/timesheets/ts-1/approve")).toHaveLength(1);
    expect(api.callsTo("GET /api/timesheets")).toHaveLength(2);
  });
});
