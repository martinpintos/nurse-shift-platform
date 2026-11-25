"use client";

import type { UserRole } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LOGIN_PATH, ROLE_HOME } from "../lib/roles";
import { useSession, type SessionState } from "../lib/session";
import { AppShell } from "./shell/AppShell";
import { SessionError, SessionLoading } from "./FullPageMessage";

/** Where a page for `role` should send this session, or null to stay. */
export function redirectTarget(
  state: SessionState,
  role: UserRole | null,
): string | null {
  if (state.status === "anonymous") return LOGIN_PATH;
  if (state.status !== "authenticated") return null;
  const home = ROLE_HOME[state.user.role];
  return role === state.user.role ? null : home;
}

function useRedirect(target: string | null) {
  const router = useRouter();
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
}

/**
 * Renders `children` in the app shell only for a signed-in user with `role`. Signed-out
 * visitors go to /login; other roles go to their own home. The API enforces permissions
 * regardless; this only keeps people on the right page.
 */
export function RequireRole({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}) {
  const { state, retry } = useSession();
  useRedirect(redirectTarget(state, role));

  if (state.status === "error") {
    return <SessionError message={state.message} onRetry={retry} />;
  }
  if (state.status !== "authenticated" || state.user.role !== role) {
    return <SessionLoading />;
  }
  return <AppShell user={state.user}>{children}</AppShell>;
}

/** `/`: sends everyone to /login or their role's home. */
export function RoleRedirect() {
  const { state, retry } = useSession();
  useRedirect(redirectTarget(state, null));

  if (state.status === "error") {
    return <SessionError message={state.message} onRetry={retry} />;
  }
  return <SessionLoading />;
}
