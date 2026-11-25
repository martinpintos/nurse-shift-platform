import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  AdminShiftListResponseSchema,
  LoginResponseSchema,
  ResetResponseSchema,
  TEST_IDS,
  type AdminShift,
} from "@repo/shared";

/** The spec's sample logins (docs/spec.md). Test values, not secrets. */
export const PASSWORD = "Trial2026!";
export const USERS = {
  maria: "maria.lopez@example.com",
  james: "james.cook@example.com",
  agencyA: "admin@sunrisehealth.example",
  agencyB: "admin@metrocare.example",
  admin: "alex.kim@example.com",
} as const;

export async function apiToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.status(), `sign in ${email}`).toBe(200);
  return LoginResponseSchema.parse(await response.json()).token;
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** Restores the spec's sample data through the admin API. */
export async function resetDemoData(request: APIRequestContext): Promise<void> {
  const token = await apiToken(request, USERS.admin);
  const response = await request.post("/api/admin/reset", {
    headers: bearer(token),
  });
  expect(response.status(), "admin reset").toBe(200);
  ResetResponseSchema.parse(await response.json());
}

/** The admin dashboard feed, for checking what a UI action did. */
export async function adminShift(
  request: APIRequestContext,
  id: string,
): Promise<AdminShift> {
  const token = await apiToken(request, USERS.admin);
  const response = await request.get("/api/admin/shifts", {
    headers: bearer(token),
  });
  expect(response.status()).toBe(200);
  const { shifts } = AdminShiftListResponseSchema.parse(await response.json());
  const shift = shifts.find((candidate) => candidate.id === id);
  if (!shift) throw new Error(`No shift ${id} in the admin feed`);
  return shift;
}

export async function claimViaApi(
  request: APIRequestContext,
  email: string,
  shiftId: string,
): Promise<void> {
  const token = await apiToken(request, email);
  const response = await request.post(`/api/shifts/${shiftId}/claim`, {
    headers: bearer(token),
  });
  expect(response.status(), `claim ${shiftId}`).toBe(200);
}

/** Signs in through the login form, using only the required test IDs. */
export async function signIn(
  page: Page,
  email: string,
  landing: RegExp,
): Promise<void> {
  // A second sign-in in one test: drop the first session, or /login redirects home.
  if (page.url().startsWith("http")) {
    await page.evaluate(() => window.sessionStorage.clear());
  }
  await page.goto("/login");
  await page.getByTestId(TEST_IDS.loginEmailInput).fill(email);
  await page.getByTestId(TEST_IDS.loginPasswordInput).fill(PASSWORD);
  await page.getByTestId(TEST_IDS.loginSubmitButton).click();
  await expect(page).toHaveURL(landing);
}

export function banner(page: Page): Locator {
  return page.getByTestId(TEST_IDS.notificationBanner);
}

/**
 * Matches a shift id in an element's text. Cell texts run together ("overnightshift-1Claim"),
 * so no word boundaries; only make sure shift-1 doesn't match shift-10.
 */
function idPattern(shiftId: string): RegExp {
  return new RegExp(`${shiftId}(?!\\d)`);
}

/** An item in the nurse's open-shifts list, by shift id. */
export function openShift(page: Page, shiftId: string): Locator {
  return page
    .getByTestId(TEST_IDS.shiftListItem)
    .and(page.locator(`[data-shift-id=${JSON.stringify(shiftId)}]`));
}

/** A row of the admin dashboard table, by shift id. */
export function adminRow(page: Page, shiftId: string): Locator {
  return page
    .getByTestId(TEST_IDS.adminDashboardShiftTable)
    .locator("tbody tr")
    .filter({ hasText: idPattern(shiftId) });
}

/** Records every native dialog, so a test can assert that none appeared. */
export function recordDialogs(page: Page): string[] {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });
  return dialogs;
}

/** A minimal valid PDF, optionally padded to roughly `sizeBytes`. */
export function samplePdf(sizeBytes = 0): Buffer {
  const head = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n";
  const tail = "trailer << /Root 1 0 R >>\n%%EOF\n";
  const padding = Math.max(0, sizeBytes - head.length - tail.length);
  return Buffer.concat([
    Buffer.from(head),
    Buffer.from(`%${"x".repeat(Math.max(0, padding - 2))}\n`),
    Buffer.from(tail),
  ]);
}
