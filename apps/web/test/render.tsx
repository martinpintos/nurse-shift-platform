import type { MeResponse } from "@repo/shared";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { Providers } from "../components/Providers";
import { TOKEN_STORAGE_KEY } from "../lib/session";
import {
  errorResponse,
  mockApi,
  type ApiMock,
  type RouteHandler,
} from "./fetch-mock";

export const TEST_TOKEN = "test-token";

/**
 * Renders `ui` inside the real providers with fetch mocked. With a user, a token is in
 * sessionStorage and GET /api/auth/me returns that user; with null, the visitor is signed out.
 */
export function renderApp(
  ui: ReactElement,
  {
    user = null,
    routes = {},
  }: { user?: MeResponse | null; routes?: Record<string, RouteHandler> } = {},
): RenderResult & { api: ApiMock } {
  if (user) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TEST_TOKEN);
  const api = mockApi({
    "GET /api/auth/me":
      user ?? (() => errorResponse(401, "Authentication required")),
    ...routes,
  });
  return { ...render(<Providers>{ui}</Providers>), api };
}
