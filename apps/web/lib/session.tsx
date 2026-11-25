"use client";

import type { MeResponse } from "@repo/shared";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, createApiClient, errorMessage, type ApiClient } from "./api";
import { useNotifications } from "./notifications";
import { LOGIN_PATH } from "./roles";

/** sessionStorage key. Per tab, gone when the tab closes; never a cookie or localStorage. */
export const TOKEN_STORAGE_KEY = "shiftpatch.token";

function readToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be blocked (private modes, strict settings): treat as signed out.
    return null;
  }
}

function writeToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Without storage the session lasts until the next reload.
  }
}

function clearToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: MeResponse }
  /** The token exists but /me failed for a reason other than 401 (network, 5xx). */
  | { status: "error"; message: string };

interface SessionValue {
  state: SessionState;
  api: ApiClient;
  login: (email: string, password: string) => Promise<MeResponse>;
  logout: () => void;
  retry: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

async function resolveSession(api: ApiClient): Promise<SessionState> {
  if (!readToken()) return { status: "anonymous" };
  try {
    return { status: "authenticated", user: await api.me() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { status: "anonymous" };
    }
    return { status: "error", message: errorMessage(error) };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { notifyError, clear: clearNotification } = useNotifications();
  // Starts as "loading" on the server and the client alike, so hydration matches.
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const api = useMemo(
    () =>
      createApiClient({
        getToken: readToken,
        onUnauthorized: (message) => {
          clearToken();
          setState({ status: "anonymous" });
          router.replace(LOGIN_PATH);
          // Say why on the login page, e.g. "Invalid or expired token". Scoped to /login,
          // so the route change that is about to happen doesn't drop it.
          notifyError(message, { scope: LOGIN_PATH });
        },
      }),
    [router, notifyError],
  );

  useEffect(() => {
    let active = true;
    void resolveSession(api).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [api, attempt]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token } = await api.login({ email, password });
      writeToken(token);
      try {
        // /me carries the agencyId the login response doesn't.
        const user = await api.me();
        setState({ status: "authenticated", user });
        return user;
      } catch (error) {
        clearToken();
        throw error;
      }
    },
    [api],
  );

  const logout = useCallback(() => {
    clearToken();
    clearNotification();
    setState({ status: "anonymous" });
    router.replace(LOGIN_PATH);
  }, [router, clearNotification]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ state, api, login, logout, retry }),
    [state, api, login, logout, retry],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export function useApi(): ApiClient {
  return useSession().api;
}

/** The signed-in user. Only for components rendered inside RequireRole. */
export function useCurrentUser(): MeResponse {
  const { state } = useSession();
  if (state.status !== "authenticated") {
    throw new Error("useCurrentUser must be used inside RequireRole");
  }
  return state.user;
}
