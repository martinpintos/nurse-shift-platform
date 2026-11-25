import { ERROR_MESSAGES, TEST_IDS, type MeResponse } from "@repo/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { errorResponse, jsonResponse } from "../test/fetch-mock";
import { admin, agency, nurse } from "../test/fixtures";
import { TEST_TOKEN, renderApp } from "../test/render";
import { router } from "../test/router";
import { TOKEN_STORAGE_KEY, useApi } from "../lib/session";
import { LoginView } from "../views/LoginView";
import { NotificationBanner } from "./NotificationBanner";
import { RequireRole, RoleRedirect } from "./RoleRouting";

const homes: [MeResponse, string][] = [
  [nurse, "/nurse"],
  [agency, "/agency"],
  [admin, "/admin"],
];

function storedToken() {
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

describe("role routing", () => {
  it("sends a signed-out visitor from / to /login without calling the API", async () => {
    const { api } = renderApp(<RoleRedirect />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(api.calls).toHaveLength(0);
  });

  it.each(homes)("sends %s.role from / to their home", async (user, home) => {
    const { api } = renderApp(<RoleRedirect />, { user });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    expect(
      api.callsTo("GET /api/auth/me")[0]?.headers.get("Authorization"),
    ).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it.each(homes)(
    "sends a signed-in %s.role away from /login to their home",
    async (user, home) => {
      renderApp(<LoginView />, { user });
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    },
  );

  it("redirects a wrong-role page to the user's own home and hides its content", async () => {
    renderApp(
      <RequireRole role="admin">
        <p>Admin only</p>
      </RequireRole>,
      { user: nurse },
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/nurse"));
    expect(screen.queryByText("Admin only")).toBeNull();
  });

  it("sends a signed-out visitor from a role page to /login", async () => {
    renderApp(
      <RequireRole role="nurse">
        <p>Nurse page</p>
      </RequireRole>,
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Nurse page")).toBeNull();
  });

  it("renders the page in the app shell for the right role", async () => {
    renderApp(
      <RequireRole role="agency">
        <p>Agency page</p>
      </RequireRole>,
      { user: agency },
    );
    expect(await screen.findByText("Agency page")).toBeTruthy();
    expect(screen.getByText("Sunrise Health Staffing")).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.notificationBanner)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("session", () => {
  it("signs in, keeps the token in sessionStorage only, and goes to the role's home", async () => {
    const { api } = renderApp(<LoginView />, {
      routes: {
        "POST /api/auth/login": {
          token: "fresh-token",
          user: { id: agency.id, name: agency.name, role: "agency" },
        },
        "GET /api/auth/me": (call) =>
          call.headers.get("Authorization") === "Bearer fresh-token"
            ? jsonResponse(agency)
            : errorResponse(401, ERROR_MESSAGES.invalidToken),
      },
    });

    fireEvent.change(screen.getByTestId(TEST_IDS.loginEmailInput), {
      target: { value: "admin@sunrisehealth.example" },
    });
    fireEvent.change(screen.getByTestId(TEST_IDS.loginPasswordInput), {
      target: { value: "Trial2026!" },
    });
    fireEvent.click(screen.getByTestId(TEST_IDS.loginSubmitButton));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/agency"));
    expect(api.callsTo("POST /api/auth/login")[0]?.body).toEqual({
      email: "admin@sunrisehealth.example",
      password: "Trial2026!",
    });
    expect(storedToken()).toBe("fresh-token");
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("shows a failed login's API error in the banner and stays on /login", async () => {
    renderApp(<LoginView />, {
      routes: {
        "POST /api/auth/login": () =>
          errorResponse(401, ERROR_MESSAGES.invalidCredentials),
      },
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "maria.lopez@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const banner = screen.getByTestId(TEST_IDS.notificationBanner);
    await waitFor(() =>
      expect(banner.textContent).toBe("Invalid email or password"),
    );
    expect(banner.dataset.variant).toBe("error");
    expect(router.replace).not.toHaveBeenCalled();
    expect(storedToken()).toBeNull();
  });

  it("clears a rejected token on load and goes to /login", async () => {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, "stale-token");
    renderApp(<RoleRedirect />, {
      routes: {
        "GET /api/auth/me": () =>
          errorResponse(401, ERROR_MESSAGES.invalidToken),
      },
    });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(storedToken()).toBeNull();
  });

  it("clears the session and goes to /login when any authenticated call gets a 401", async () => {
    function Probe() {
      const api = useApi();
      return (
        <button
          type="button"
          onClick={() => void api.listShifts().catch(() => {})}
        >
          Load shifts
        </button>
      );
    }
    renderApp(
      <>
        {/* Stands in for the login page's banner, which the mocked router never shows. */}
        <NotificationBanner />
        <RequireRole role="nurse">
          <Probe />
        </RequireRole>
      </>,
      {
        user: nurse,
        routes: {
          "GET /api/shifts": () =>
            errorResponse(401, ERROR_MESSAGES.invalidToken),
        },
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Load shifts" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(storedToken()).toBeNull();
    expect(screen.queryByRole("button", { name: "Load shifts" })).toBeNull();
    // The banner says why the user is back at sign-in.
    const [banner] = screen.getAllByTestId(TEST_IDS.notificationBanner);
    expect(banner?.textContent).toBe("Invalid or expired token");
  });

  it("signs out: clears the token and goes to /login", async () => {
    renderApp(
      <RequireRole role="nurse">
        <p>Nurse page</p>
      </RequireRole>,
      { user: nurse },
    );
    expect(await screen.findByText("Nurse page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(storedToken()).toBeNull();
    expect(screen.queryByText("Nurse page")).toBeNull();
  });

  it("offers a retry when the session can't be checked (API unreachable)", async () => {
    renderApp(<RoleRedirect />, {
      user: nurse,
      routes: {
        "GET /api/auth/me": () => new Response("Bad gateway", { status: 502 }),
      },
    });
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect(storedToken()).toBe(TEST_TOKEN);
  });
});
