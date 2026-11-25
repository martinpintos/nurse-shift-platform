import {
  CREDENTIAL_FILE_FIELD,
  ERROR_MESSAGES,
  MAX_CREDENTIAL_BYTES,
  TEST_IDS,
  type Shift,
} from "@repo/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequireRole } from "../../components/RoleRouting";
import {
  errorResponse,
  jsonResponse,
  type RouteHandler,
} from "../../test/fetch-mock";
import {
  credential,
  nurse,
  seedShifts,
  shift1,
  shift2,
  refs,
} from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { NurseView } from "./NurseView";

/** shift-4 is filled by another nurse: it must show nowhere with a button. */
const takenByOther: Shift = {
  ...shift1,
  id: "shift-4",
  status: "filled",
  claimedBy: "nurse-2",
};

function renderNurse(routes: Record<string, RouteHandler> = {}) {
  return renderApp(
    <RequireRole role="nurse">
      <NurseView />
    </RequireRole>,
    {
      user: nurse,
      routes: {
        "GET /api/shifts": { shifts: [...seedShifts, takenByOther] },
        "GET /api/timesheets": { timesheets: [], refs },
        "GET /api/credentials": { credentials: [credential] },
        ...routes,
      },
    },
  );
}

function banner() {
  return screen.getByTestId(TEST_IDS.notificationBanner);
}

async function expectBanner(text: string, variant: "success" | "error") {
  await waitFor(() => expect(banner().textContent).toBe(text));
  expect(banner().dataset.variant).toBe(variant);
}

function myShifts() {
  return screen.getByRole("list", { name: "Your claimed shifts" });
}

describe("NurseView: shifts", () => {
  it("lists only open shifts, each with a claim button; cancel only on my claimed shifts", async () => {
    renderNurse();
    const items = await screen.findAllByTestId(TEST_IDS.shiftListItem);

    expect(items).toHaveLength(2);
    expect(
      items.map((item) => within(item).getByText(/^shift-/).textContent),
    ).toEqual(["shift-1", "shift-3"]);
    for (const item of items) {
      expect(
        within(item).getAllByTestId(TEST_IDS.shiftClaimButton),
      ).toHaveLength(1);
      expect(within(item).queryByTestId(TEST_IDS.shiftCancelButton)).toBeNull();
    }

    const claimed = within(myShifts()).getAllByRole("listitem");
    expect(claimed).toHaveLength(1);
    expect(within(claimed[0]!).getByText("shift-2")).toBeTruthy();
    expect(
      within(myShifts()).getAllByTestId(TEST_IDS.shiftCancelButton),
    ).toHaveLength(1);
    expect(
      within(myShifts()).queryByTestId(TEST_IDS.shiftClaimButton),
    ).toBeNull();

    // Totals across the page: 2 claimable, 1 cancellable, nothing for nurse-2's shift.
    expect(screen.getAllByTestId(TEST_IDS.shiftClaimButton)).toHaveLength(2);
    expect(screen.getAllByTestId(TEST_IDS.shiftCancelButton)).toHaveLength(1);
    expect(screen.queryByText("shift-4")).toBeNull();
  });

  it("claims a shift, shows 'Shift claimed' and refreshes the list", async () => {
    const { api } = renderNurse({
      "POST /api/shifts/shift-1/claim": {
        ...shift1,
        status: "filled",
        claimedBy: "nurse-1",
      },
    });
    const [first] = await screen.findAllByTestId(TEST_IDS.shiftListItem);
    api.set("GET /api/shifts", {
      shifts: [{ ...shift1, status: "filled", claimedBy: "nurse-1" }, shift2],
    });

    fireEvent.click(within(first!).getByTestId(TEST_IDS.shiftClaimButton));

    await expectBanner("Shift claimed", "success");
    await waitFor(() =>
      expect(screen.queryAllByTestId(TEST_IDS.shiftListItem)).toHaveLength(0),
    );
    expect(api.callsTo("GET /api/shifts")).toHaveLength(2);
    // A new banner message doesn't re-check the session or reload unrelated data.
    expect(api.callsTo("GET /api/auth/me")).toHaveLength(1);
    expect(api.callsTo("GET /api/credentials")).toHaveLength(1);
    expect(
      within(myShifts()).getAllByTestId(TEST_IDS.shiftCancelButton),
    ).toHaveLength(2);
  });

  it("shows a refused claim's API error verbatim", async () => {
    renderNurse({
      "POST /api/shifts/shift-3/claim": () =>
        errorResponse(403, ERROR_MESSAGES.credentialExpired),
    });
    const items = await screen.findAllByTestId(TEST_IDS.shiftListItem);

    fireEvent.click(within(items[1]!).getByTestId(TEST_IDS.shiftClaimButton));

    await expectBanner("Credential expired, cannot claim shift", "error");
  });

  it("cancels in advance with one click: default reason, no confirm, no dialog", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { api } = renderNurse({
      "POST /api/shifts/shift-2/cancel": {
        ...shift2,
        status: "open",
        claimedBy: null,
        cancellation: { reason: "advance", previousNurseId: "nurse-1" },
      },
    });
    await screen.findAllByTestId(TEST_IDS.shiftListItem);

    const reason = within(myShifts()).getByRole("combobox", {
      name: /cancellation reason/i,
    }) as HTMLSelectElement;
    expect(reason.value).toBe("advance");
    // No-show is a staff action: shown for context, not selectable.
    const noShow = within(reason).getByRole("option", {
      name: /no-show/i,
    }) as HTMLOptionElement;
    expect(noShow.disabled).toBe(true);

    fireEvent.click(within(myShifts()).getByTestId(TEST_IDS.shiftCancelButton));

    await expectBanner("Shift cancelled", "success");
    expect(api.callsTo("POST /api/shifts/shift-2/cancel")[0]?.body).toEqual({
      reason: "advance",
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("NurseView: timesheets", () => {
  it("defaults actual hours to the shift's times and submits them", async () => {
    const { api } = renderNurse({
      "POST /api/timesheets": () =>
        jsonResponse(
          {
            id: "ts-1",
            shiftId: "shift-2",
            nurseId: "nurse-1",
            agencyId: "agency-a",
            date: "2026-10-03",
            actualStart: "07:00",
            actualEnd: "19:00",
            minutesWorked: 720,
            status: "submitted",
            submittedAt: "2026-11-24T12:00:00.000Z",
            approvedAt: null,
            approvedBy: null,
          },
          201,
        ),
    });
    await screen.findAllByTestId(TEST_IDS.shiftListItem);

    const start = within(myShifts()).getByLabelText(
      "Start",
    ) as HTMLInputElement;
    const end = within(myShifts()).getByLabelText("End") as HTMLInputElement;
    expect([start.value, end.value]).toEqual(["07:00", "19:00"]);

    fireEvent.click(
      within(myShifts()).getByRole("button", { name: /submit timesheet/i }),
    );

    await expectBanner("Timesheet submitted", "success");
    expect(api.callsTo("POST /api/timesheets")[0]?.body).toEqual({
      shiftId: "shift-2",
      actualStart: "07:00",
      actualEnd: "19:00",
    });
    expect(api.callsTo("GET /api/timesheets")).toHaveLength(2);
    expect(screen.getByTestId(TEST_IDS.timesheetTable)).toBeTruthy();
  });
});

describe("NurseView: credentials", () => {
  const pdf = () =>
    new File(["%PDF-1.7"], "renewed-license.pdf", { type: "application/pdf" });
  const uploaded = {
    ...credential,
    id: "cred-2",
    fileName: "renewed-license.pdf",
  };

  function fileInput() {
    return screen.getByTestId(
      TEST_IDS.credentialUploadInput,
    ) as HTMLInputElement;
  }
  function expiryInput() {
    return screen.getByTestId(
      TEST_IDS.credentialExpiryDateInput,
    ) as HTMLInputElement;
  }

  it("uploads automatically once a file and an expiry date are set, without clicking Upload", async () => {
    const user = userEvent.setup();
    const { api } = renderNurse({
      "POST /api/credentials": () => jsonResponse(uploaded, 201),
    });
    await screen.findByRole("list", { name: "Your license documents" });

    await user.upload(fileInput(), pdf());
    expect(api.callsTo("POST /api/credentials")).toHaveLength(0);
    fireEvent.change(expiryInput(), { target: { value: "2028-03-31" } });

    await expectBanner("Credential uploaded", "success");
    const posts = api.callsTo("POST /api/credentials");
    expect(posts).toHaveLength(1);
    const form = posts[0]?.body as FormData;
    expect((form.get(CREDENTIAL_FILE_FIELD) as File).name).toBe(
      "renewed-license.pdf",
    );
    expect(form.get("expiresOn")).toBe("2028-03-31");
    // The form resets and the list reloads.
    await waitFor(() => expect(expiryInput().value).toBe(""));
    expect(fileInput().value).toBe("");
    expect(api.callsTo("GET /api/credentials")).toHaveLength(2);
  });

  it("also fires when the date comes first and the file second", async () => {
    const user = userEvent.setup();
    const { api } = renderNurse({
      "POST /api/credentials": () => jsonResponse(uploaded, 201),
    });
    await screen.findByRole("list", { name: "Your license documents" });

    fireEvent.change(expiryInput(), { target: { value: "2028-03-31" } });
    expect(api.callsTo("POST /api/credentials")).toHaveLength(0);
    await user.upload(fileInput(), pdf());

    await expectBanner("Credential uploaded", "success");
    expect(api.callsTo("POST /api/credentials")).toHaveLength(1);
  });

  it("waits for a complete year while a date is typed digit by digit", async () => {
    const user = userEvent.setup();
    const { api } = renderNurse({
      "POST /api/credentials": () => jsonResponse(uploaded, 201),
    });
    await screen.findByRole("list", { name: "Your license documents" });
    await user.upload(fileInput(), pdf());

    for (const partial of ["0002-03-31", "0020-03-31", "0202-03-31"]) {
      fireEvent.change(expiryInput(), { target: { value: partial } });
    }
    expect(api.callsTo("POST /api/credentials")).toHaveLength(0);

    fireEvent.change(expiryInput(), { target: { value: "2028-03-31" } });
    await expectBanner("Credential uploaded", "success");
    expect(api.callsTo("POST /api/credentials")).toHaveLength(1);
  });

  it("uploads on the visible Upload button too", async () => {
    const user = userEvent.setup();
    const { api } = renderNurse({
      "POST /api/credentials": () => jsonResponse(uploaded, 201),
    });
    await screen.findByRole("list", { name: "Your license documents" });

    // A pre-2000 date never auto-fires, so the button is the only way to send it.
    fireEvent.change(expiryInput(), { target: { value: "1999-12-31" } });
    await user.upload(fileInput(), pdf());
    expect(api.callsTo("POST /api/credentials")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Upload" }));
    await expectBanner("Credential uploaded", "success");
    expect(
      (api.callsTo("POST /api/credentials")[0]?.body as FormData).get(
        "expiresOn",
      ),
    ).toBe("1999-12-31");
  });

  it("rejects the wrong file type client-side, with the API's message", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { api } = renderNurse();
    await screen.findByRole("list", { name: "Your license documents" });
    fireEvent.change(expiryInput(), { target: { value: "2028-03-31" } });

    await user.upload(
      fileInput(),
      new File(["hi"], "license.docx", { type: "application/msword" }),
    );

    await expectBanner(ERROR_MESSAGES.credentialFileType, "error");
    expect(fileInput().value).toBe("");
    expect(api.callsTo("POST /api/credentials")).toHaveLength(0);
  });

  it("rejects a file over the size limit client-side", async () => {
    const user = userEvent.setup();
    const { api } = renderNurse();
    await screen.findByRole("list", { name: "Your license documents" });
    fireEvent.change(expiryInput(), { target: { value: "2028-03-31" } });

    const big = new File(
      [new Uint8Array(MAX_CREDENTIAL_BYTES + 1)],
      "scan.png",
      {
        type: "image/png",
      },
    );
    await user.upload(fileInput(), big);

    await expectBanner("File must be 2 MB or smaller", "error");
    expect(api.callsTo("POST /api/credentials")).toHaveLength(0);
  });

  it("shows a server-side upload error verbatim", async () => {
    const user = userEvent.setup();
    renderNurse({
      "POST /api/credentials": () =>
        errorResponse(400, ERROR_MESSAGES.credentialFileType),
    });
    await screen.findByRole("list", { name: "Your license documents" });
    fireEvent.change(expiryInput(), { target: { value: "2028-03-31" } });
    // Named .pdf but not one: the API checks the bytes and refuses it.
    await user.upload(fileInput(), pdf());

    await expectBanner("File must be a PDF, PNG or JPEG", "error");
  });

  it("lists credentials with expiry and status, and downloads the file with the token", async () => {
    const createObjectURL = vi.fn(() => "blob:license");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const { api } = renderNurse({
      "GET /api/credentials/cred-1/file": () =>
        new Response("%PDF-1.7", {
          headers: { "Content-Type": "application/pdf" },
        }),
    });

    const list = await screen.findByRole("list", {
      name: "Your license documents",
    });
    expect(within(list).getByText("Jan 1, 2027")).toBeTruthy();
    expect(within(list).getByText("valid")).toBeTruthy();

    fireEvent.click(
      within(list).getByRole("button", { name: /download rn-license\.pdf/i }),
    );

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(
      api
        .callsTo("GET /api/credentials/cred-1/file")[0]
        ?.headers.get("Authorization"),
    ).toBe("Bearer test-token");
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it("warns when the license on file has expired", async () => {
    renderNurse({
      "GET /api/credentials": {
        credentials: [
          { ...credential, expiresOn: "2026-06-01", status: "expired" },
        ],
      },
    });
    expect(
      await screen.findByText(/your license expired on jun 1, 2026/i),
    ).toBeTruthy();
  });
});
