import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { TEST_IDS, type TestId } from "@repo/shared";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { RequireRole } from "../components/RoleRouting";
import type { RouteHandler } from "../test/fetch-mock";
import {
  admin,
  adminShifts,
  agency,
  auditEntry,
  credential,
  nurse,
  outboxMessage,
  seedShifts,
  shift1,
  shift2,
  submittedTimesheet,
  refs,
} from "../test/fixtures";
import { renderApp } from "../test/render";
import { AdminView } from "./admin/AdminView";
import { AgencyView } from "./agency/AgencyView";
import { LoginView } from "./LoginView";
import { NurseView } from "./nurse/NurseView";

/** The kind of element each test ID must sit on: the one that performs the action. */
const EXPECTED_ELEMENT: Record<TestId, string> = {
  "login-email-input": "input[type=email]",
  "login-password-input": "input[type=password]",
  "login-submit-button": "button[type=submit]",
  "shift-list-item": "li",
  "shift-claim-button": "button",
  "shift-cancel-button": "button",
  "credential-upload-input": "input[type=file]",
  "credential-expiry-date-input": "input[type=date]",
  "agency-post-shift-button": "button",
  "agency-post-shift-submit-button": "button[type=submit]",
  "admin-dashboard-shift-table": "table",
  "admin-shift-status-badge": "span",
  "audit-log-table": "table",
  "timesheet-table": "table",
  "notification-banner": "div[role=status][aria-live=polite]",
};

const views: {
  name: string;
  ui: ReactElement;
  user: typeof nurse | null;
  routes: Record<string, RouteHandler>;
  ready: () => Promise<unknown>;
}[] = [
  {
    name: "login",
    ui: <LoginView />,
    user: null,
    routes: {},
    ready: () => screen.findByTestId(TEST_IDS.loginSubmitButton),
  },
  {
    name: "nurse",
    ui: (
      <RequireRole role="nurse">
        <NurseView />
      </RequireRole>
    ),
    user: nurse,
    routes: {
      "GET /api/shifts": { shifts: seedShifts },
      "GET /api/timesheets": { timesheets: [], refs },
      "GET /api/credentials": { credentials: [credential] },
    },
    ready: () => screen.findAllByTestId(TEST_IDS.shiftCancelButton),
  },
  {
    name: "agency",
    ui: (
      <RequireRole role="agency">
        <AgencyView />
      </RequireRole>
    ),
    user: agency,
    routes: {
      "GET /api/agencies/agency-a/shifts": {
        agencyId: "agency-a",
        shifts: [shift1, shift2],
      },
      "GET /api/timesheets": { timesheets: [submittedTimesheet], refs },
    },
    ready: async () => {
      await screen.findAllByTestId(TEST_IDS.shiftCancelButton);
      fireEvent.click(screen.getByTestId(TEST_IDS.agencyPostShiftButton));
    },
  },
  {
    name: "admin",
    ui: (
      <RequireRole role="admin">
        <AdminView />
      </RequireRole>
    ),
    user: admin,
    routes: {
      "GET /api/admin/shifts": { shifts: adminShifts, refs },
      "GET /api/admin/audit-log": { entries: [auditEntry], refs },
      "GET /api/admin/outbox": { messages: [outboxMessage], refs },
      "GET /api/timesheets": { timesheets: [submittedTimesheet], refs },
    },
    ready: () => screen.findAllByTestId(TEST_IDS.adminShiftStatusBadge),
  },
];

describe("required test IDs", () => {
  it("renders every one of the 15 TEST_IDS somewhere in the app, on the acting element", async () => {
    const seen = new Map<string, Set<string>>();

    for (const view of views) {
      renderApp(view.ui, { user: view.user, routes: view.routes });
      await view.ready();
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-testid]",
      )) {
        const id = element.dataset.testid!;
        const expected = EXPECTED_ELEMENT[id as TestId];
        expect(
          expected,
          `unknown test ID "${id}" in the ${view.name} view`,
        ).toBeDefined();
        expect(
          element.matches(expected),
          `${id} in the ${view.name} view is on <${element.tagName.toLowerCase()}>`,
        ).toBe(true);
        seen.set(id, (seen.get(id) ?? new Set()).add(view.name));
      }
      cleanup();
    }

    const required = Object.values(TEST_IDS);
    expect(required).toHaveLength(15);
    expect([...seen.keys()].sort()).toEqual([...required].sort());
    // The one banner is on every screen.
    expect([...(seen.get(TEST_IDS.notificationBanner) ?? [])].sort()).toEqual(
      views.map((view) => view.name).sort(),
    );
  });

  it("uses test IDs only through TEST_IDS, never as string literals", () => {
    const root = join(import.meta.dirname, "..");
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
          sources.push(path);
      }
    };
    for (const dir of ["app", "components", "views", "lib"])
      walk(join(root, dir));

    expect(sources.length).toBeGreaterThan(10);
    const literal = /data-testid=(["'`]|\{\s*["'`])/;
    const offenders = sources.filter((path) =>
      literal.test(readFileSync(path, "utf8")),
    );
    expect(offenders.map((path) => relative(root, path))).toEqual([]);
  });
});
