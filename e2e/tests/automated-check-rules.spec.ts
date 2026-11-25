import { expect, test } from "@playwright/test";
import { ERROR_MESSAGES, SUCCESS_MESSAGES, TEST_IDS } from "@repo/shared";
import {
  USERS,
  adminShift,
  banner,
  claimViaApi,
  recordDialogs,
  resetDemoData,
  samplePdf,
  signIn,
} from "../helpers.js";

/**
 * The automated UI checks only know the 15 required test IDs. These tests use nothing
 * else: no extra clicks, no labels, no dialogs.
 */
test.beforeEach(async ({ request }) => {
  await resetDemoData(request);
});

test("a credential uploads once file and expiry are set, with no button click", async ({
  page,
}) => {
  await signIn(page, USERS.maria, /\/nurse$/);
  await page.getByTestId(TEST_IDS.credentialUploadInput).setInputFiles({
    name: "rn-license-renewal.pdf",
    mimeType: "application/pdf",
    buffer: samplePdf(),
  });
  await page.getByTestId(TEST_IDS.credentialExpiryDateInput).fill("2028-06-30");
  await expect(banner(page)).toContainText(SUCCESS_MESSAGES.credentialUploaded);
});

test("clicking only the post-shift button, then submit, posts a valid shift", async ({
  page,
  request,
}) => {
  const dialogs = recordDialogs(page);
  await signIn(page, USERS.agencyA, /\/agency$/);
  await page.getByTestId(TEST_IDS.agencyPostShiftButton).click();
  await page.getByTestId(TEST_IDS.agencyPostShiftSubmitButton).click();
  await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftPosted);
  expect((await adminShift(request, "shift-4")).status).toBe("open");
  expect(dialogs).toEqual([]);
});

test.describe("one click on shift-cancel-button cancels, with the role's default reason", () => {
  test("nurse: advance", async ({ page, request }) => {
    const dialogs = recordDialogs(page);
    await signIn(page, USERS.maria, /\/nurse$/);
    await page.getByTestId(TEST_IDS.shiftCancelButton).click();
    await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftCancelled);
    expect(
      (await adminShift(request, "shift-2")).cancellations[0]?.reason,
    ).toBe("advance");
    expect(dialogs).toEqual([]);
  });

  test("agency: no-show", async ({ page, request }) => {
    const dialogs = recordDialogs(page);
    await signIn(page, USERS.agencyA, /\/agency$/);
    await page.getByTestId(TEST_IDS.shiftCancelButton).click();
    await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftCancelled);
    expect(
      (await adminShift(request, "shift-2")).cancellations[0]?.reason,
    ).toBe("no-show");
    expect(dialogs).toEqual([]);
  });

  test("admin: no-show", async ({ page, request }) => {
    const dialogs = recordDialogs(page);
    await signIn(page, USERS.admin, /\/admin$/);
    await page.getByTestId(TEST_IDS.shiftCancelButton).click();
    await expect(banner(page)).toContainText(SUCCESS_MESSAGES.shiftCancelled);
    expect(
      (await adminShift(request, "shift-2")).cancellations[0],
    ).toMatchObject({
      reason: "no-show",
      cancelledBy: "admin-1",
    });
    expect(dialogs).toEqual([]);
  });
});

test.describe("claim buttons only on open shifts, cancel buttons only on claimed ones", () => {
  test("nurse view", async ({ page, request }) => {
    await signIn(page, USERS.maria, /\/nurse$/);
    // Seed: shift-1 and shift-3 open, shift-2 claimed by Maria.
    const items = page.getByTestId(TEST_IDS.shiftListItem);
    await expect(items).toHaveCount(2);
    await expect(page.getByTestId(TEST_IDS.shiftClaimButton)).toHaveCount(2);
    for (const item of await items.all()) {
      await expect(item.getByTestId(TEST_IDS.shiftClaimButton)).toHaveCount(1);
      await expect(item.getByTestId(TEST_IDS.shiftCancelButton)).toHaveCount(0);
    }
    await expect(page.getByTestId(TEST_IDS.shiftCancelButton)).toHaveCount(1);

    await claimViaApi(request, USERS.maria, "shift-1");
    await page.reload();
    await expect(page.getByTestId(TEST_IDS.shiftClaimButton)).toHaveCount(1);
    await expect(page.getByTestId(TEST_IDS.shiftCancelButton)).toHaveCount(2);
  });

  test("agency view", async ({ page }) => {
    await signIn(page, USERS.agencyA, /\/agency$/);
    // Agency A owns shift-1 (open) and shift-2 (filled).
    await expect(page.getByTestId(TEST_IDS.shiftCancelButton)).toHaveCount(1);
    await expect(page.getByTestId(TEST_IDS.shiftClaimButton)).toHaveCount(0);
  });

  test("admin view", async ({ page }) => {
    await signIn(page, USERS.admin, /\/admin$/);
    await expect(page.getByTestId(TEST_IDS.shiftCancelButton)).toHaveCount(1);
    await expect(page.getByTestId(TEST_IDS.shiftClaimButton)).toHaveCount(0);
  });
});

test.describe("credential uploads through the proxy", () => {
  test("a file just under the 2 MB limit uploads", async ({ page }) => {
    await signIn(page, USERS.maria, /\/nurse$/);
    await page.getByTestId(TEST_IDS.credentialUploadInput).setInputFiles({
      name: "large-license-scan.pdf",
      mimeType: "application/pdf",
      buffer: samplePdf(1.9 * 1024 * 1024),
    });
    await page
      .getByTestId(TEST_IDS.credentialExpiryDateInput)
      .fill("2028-06-30");
    await expect(banner(page)).toContainText(
      SUCCESS_MESSAGES.credentialUploaded,
      { timeout: 30_000 },
    );
  });

  test("a text file posing as a PDF is refused by the API", async ({
    page,
  }) => {
    await signIn(page, USERS.maria, /\/nurse$/);
    await page.getByTestId(TEST_IDS.credentialUploadInput).setInputFiles({
      name: "not-really.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("just some text, not a PDF\n"),
    });
    await page
      .getByTestId(TEST_IDS.credentialExpiryDateInput)
      .fill("2028-06-30");
    await expect(banner(page)).toContainText(ERROR_MESSAGES.credentialFileType);
  });
});
