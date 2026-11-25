import { expect, test } from "@playwright/test";
import { ERROR_MESSAGES, SUCCESS_MESSAGES, TEST_IDS } from "@repo/shared";
import {
  USERS,
  adminRow,
  adminShift,
  banner,
  claimViaApi,
  openShift,
  resetDemoData,
  signIn,
} from "../helpers.js";

test.beforeEach(async ({ request }) => {
  await resetDemoData(request);
});

test.describe("sign in", () => {
  for (const [email, landing] of [
    [USERS.maria, /\/nurse$/],
    [USERS.agencyA, /\/agency$/],
    [USERS.admin, /\/admin$/],
  ] as const) {
    test(`${email} lands on their view`, async ({ page }) => {
      await signIn(page, email, landing);
    });
  }

  test("a wrong password shows the spec's error in the banner", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByTestId(TEST_IDS.loginEmailInput).fill(USERS.maria);
    await page
      .getByTestId(TEST_IDS.loginPasswordInput)
      .fill("not-the-password");
    await page.getByTestId(TEST_IDS.loginSubmitButton).click();
    await expect(banner(page)).toContainText(ERROR_MESSAGES.invalidCredentials);
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("claiming", () => {
  test("Maria claims an open shift", async ({ page }) => {
    await signIn(page, USERS.maria, /\/nurse$/);
    await openShift(page, "shift-1")
      .getByTestId(TEST_IDS.shiftClaimButton)
      .click();
    await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftClaimed);
    await expect(openShift(page, "shift-1")).toHaveCount(0);
  });

  test("James, whose license expired, is refused", async ({ page }) => {
    await signIn(page, USERS.james, /\/nurse$/);
    await openShift(page, "shift-1")
      .getByTestId(TEST_IDS.shiftClaimButton)
      .click();
    await expect(banner(page)).toContainText(ERROR_MESSAGES.credentialExpired);
    await expect(openShift(page, "shift-1")).toHaveCount(1);
  });
});

test.describe("cancellations", () => {
  test("Maria cancels her claim in advance and the shift reopens", async ({
    page,
    request,
  }) => {
    await signIn(page, USERS.maria, /\/nurse$/);
    await expect(openShift(page, "shift-2")).toHaveCount(0);
    await page.getByTestId(TEST_IDS.shiftCancelButton).click();
    await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftCancelled);
    await expect(openShift(page, "shift-2")).toHaveCount(1);

    const shift = await adminShift(request, "shift-2");
    expect(shift.status).toBe("open");
    expect(shift.cancellations[0]).toMatchObject({
      reason: "advance",
      previousNurseId: "nurse-1",
      cancelledBy: "nurse-1",
    });
  });

  test("Agency A reports a no-show on its shift", async ({ page, request }) => {
    await signIn(page, USERS.agencyA, /\/agency$/);
    await page.getByTestId(TEST_IDS.shiftCancelButton).click();
    await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftCancelled);

    const shift = await adminShift(request, "shift-2");
    expect(shift.status).toBe("open");
    expect(shift.cancellations[0]).toMatchObject({
      reason: "no-show",
      cancelledBy: "agency-a",
    });
  });
});

test("Agency A posts a shift", async ({ page, request }) => {
  await signIn(page, USERS.agencyA, /\/agency$/);
  await page.getByTestId(TEST_IDS.agencyPostShiftButton).click();
  await page.getByTestId(TEST_IDS.agencyPostShiftSubmitButton).click();
  await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftPosted);

  // The seed moves shift_id_seq past shift-3, so the first post is shift-4.
  const posted = await adminShift(request, "shift-4");
  expect(posted).toMatchObject({
    agencyId: "agency-a",
    role: "RN",
    startTime: "07:00",
    endTime: "19:00",
    status: "open",
  });
});

test("the admin dashboard picks up a claim made elsewhere", async ({
  page,
  request,
}) => {
  await signIn(page, USERS.admin, /\/admin$/);
  const badge = adminRow(page, "shift-1").getByTestId(
    TEST_IDS.adminShiftStatusBadge,
  );
  await expect(badge).toContainText("open");

  await claimViaApi(request, USERS.maria, "shift-1");

  // The dashboard polls every 5 s.
  await expect(badge).toContainText("filled", { timeout: 15_000 });
  await expect(page.getByTestId(TEST_IDS.auditLogTable)).toContainText(
    "Shift claimed",
    { timeout: 15_000 },
  );
});

test("the admin sees cancellation history after a reopen", async ({
  page,
  request,
}) => {
  await signIn(page, USERS.agencyA, /\/agency$/);
  await page.getByTestId(TEST_IDS.shiftCancelButton).click();
  await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftCancelled);

  await signIn(page, USERS.admin, /\/admin$/);
  const row = adminRow(page, "shift-2");
  await expect(row.getByTestId(TEST_IDS.adminShiftStatusBadge)).toContainText(
    "open",
  );
  await expect(row).toContainText(/no-show/i);
  await expect(page.getByTestId(TEST_IDS.auditLogTable)).toContainText(
    "Shift cancelled",
  );
  // The outbox shows the notification that would have been emailed.
  await expect(page.getByRole("list", { name: /Notifications/ })).toContainText(
    "shift-2",
  );
  expect((await adminShift(request, "shift-2")).cancellations).toHaveLength(1);
});

test("timesheet: Maria submits her hours, Agency A approves them", async ({
  page,
}) => {
  await signIn(page, USERS.maria, /\/nurse$/);
  await page
    .getByRole("button", { name: /Submit timesheet for .*shift-2/ })
    .click();
  await expect(banner(page)).toContainText(SUCCESS_MESSAGES.timesheetSubmitted);
  await expect(page.getByTestId(TEST_IDS.timesheetTable)).toContainText(
    /submitted/i,
  );

  await signIn(page, USERS.agencyA, /\/agency$/);
  await page
    .getByTestId(TEST_IDS.timesheetTable)
    .getByRole("button", { name: /Approve timesheet for shift-2/ })
    .click();
  await expect(banner(page)).toContainText(SUCCESS_MESSAGES.timesheetApproved);
  await expect(page.getByTestId(TEST_IDS.timesheetTable)).toContainText(
    /approved/i,
  );
});

test("the admin exports license documents and the export is audited", async ({
  page,
}) => {
  await signIn(page, USERS.admin, /\/admin$/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export license documents" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^shiftpatch-licenses-\d{4}-\d{2}-\d{2}\.zip$/,
  );
  await expect(banner(page)).toContainText(SUCCESS_MESSAGES.licensesExported);
  await expect(page.getByTestId(TEST_IDS.auditLogTable)).toContainText(
    /exported/i,
  );
});
