import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequireRole } from "../RoleRouting";
import { admin, nurse } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { Panel } from "./Panel";

function NursePage() {
  return (
    <>
      <Panel id="open-shifts">
        <section id="open-shifts">Open shifts</section>
      </Panel>
      <Panel id="license">
        <section id="license">License</section>
      </Panel>
    </>
  );
}

describe("AppShell", () => {
  it("links the sidebar to every section of the role's page", async () => {
    renderApp(
      <RequireRole role="admin">
        <p>Admin page</p>
      </RequireRole>,
      { user: admin },
    );
    await screen.findByText("Admin page");
    const [sidebar] = screen.getAllByRole("navigation", { name: "Sections" });
    const links = within(sidebar!).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#coverage",
      "#timesheets",
      "#activity",
      "#outbox",
    ]);
  });

  it("gives phones one bottom tab per panel; the outbox lives under Activity", async () => {
    renderApp(
      <RequireRole role="admin">
        <p>Admin page</p>
      </RequireRole>,
      { user: admin },
    );
    await screen.findByText("Admin page");
    const [, tabs] = screen.getAllByRole("navigation", { name: "Sections" });
    expect(
      within(tabs!)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Shift coverage", "Timesheets", "Activity"]);
  });

  it("marks only the active tab's panels active, and switches on tap", async () => {
    renderApp(
      <RequireRole role="nurse">
        <NursePage />
      </RequireRole>,
      { user: nurse },
    );
    await screen.findByText("Open shifts");
    const panel = (id: string) =>
      document.querySelector<HTMLElement>(`[data-panel="${id}"]`)!;
    // Every panel stays in the DOM: the desktop shows them all.
    expect(panel("open-shifts").hasAttribute("data-inactive")).toBe(false);
    expect(panel("license").hasAttribute("data-inactive")).toBe(true);

    const [, tabs] = screen.getAllByRole("navigation", { name: "Sections" });
    fireEvent.click(within(tabs!).getByRole("button", { name: "License" }));
    expect(panel("open-shifts").hasAttribute("data-inactive")).toBe(true);
    expect(panel("license").hasAttribute("data-inactive")).toBe(false);
    expect(
      within(tabs!)
        .getByRole("button", { name: "License" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("sets the shell marker the toast docks against, and removes it on unmount", async () => {
    const { unmount } = renderApp(
      <RequireRole role="nurse">
        <p>Nurse page</p>
      </RequireRole>,
      { user: nurse },
    );
    await screen.findByText("Nurse page");
    expect(document.documentElement.hasAttribute("data-shell")).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute("data-shell")).toBe(false);
  });
});
