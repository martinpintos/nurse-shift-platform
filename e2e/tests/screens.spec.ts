import { test } from "@playwright/test";
import { USERS, resetDemoData, signIn } from "../helpers.js";

/**
 * Screenshots of every role's view at desktop, tablet and phone widths, for comparing
 * against docs/design. Not part of the test run: `pnpm --filter e2e screens`. Files land in
 * e2e/screenshots/ (gitignored).
 */
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 720 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
] as const;

const ROLES = [
  { name: "nurse", email: USERS.maria, landing: /\/nurse$/ },
  { name: "agency", email: USERS.agencyA, landing: /\/agency$/ },
  { name: "admin", email: USERS.admin, landing: /\/admin$/ },
] as const;

test.beforeEach(async ({ request }) => {
  await resetDemoData(request);
});

test("@screens login", async ({ page }) => {
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `screenshots/login-${size.name}.png`,
      fullPage: true,
    });
  }
});

for (const role of ROLES) {
  test(`@screens ${role.name}`, async ({ page }) => {
    await signIn(page, role.email, role.landing);
    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      await page.waitForLoadState("networkidle");
      // Let skeletons resolve and the layout settle after the resize.
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `screenshots/${role.name}-${size.name}.png`,
        fullPage: true,
      });
      await page.screenshot({
        path: `screenshots/${role.name}-${size.name}-fold.png`,
      });
    }
  });
}
