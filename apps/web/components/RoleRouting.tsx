"use client";

import type { UserRole } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LOGIN_PATH, ROLE_HOME } from "../lib/roles";
import { useSession, type SessionState } from "../lib/session";
import { AppShell } from "./shell/AppShell";
import { SessionError, SessionLoading } from "./FullPageMessage";
import { PageHeader, PageStack, Section } from "./ui/Section";
import {
  KpiSkeleton,
  ListFilterSkeleton,
  ListSkeleton,
  Skeleton,
  TableSkeleton,
} from "./ui/Skeleton";

const WORKSPACE_TITLES = {
  nurse: "Find shifts",
  agency: "Shifts",
  admin: "Shift coverage",
} as const;

function WorkspaceLoading({ role }: { role: UserRole }) {
  return (
    <PageStack>
      <PageHeader
        title={WORKSPACE_TITLES[role]}
        meta={
          role === "admin" ? undefined : <Skeleton width={152} height={20} />
        }
        titleStatus={
          role === "admin" ? <Skeleton width={76} height={18} /> : undefined
        }
        actions={
          role === "nurse" ? undefined : <Skeleton width={112} height={36} />
        }
      />
      {role === "nurse" ? (
        <Section
          title="Open shifts"
          actions={<ListFilterSkeleton />}
          fullWidthMobileActions
        >
          <ListSkeleton label="open shifts" rows={2} dated />
        </Section>
      ) : (
        <>
          {role === "admin" ? <KpiSkeleton count={5} /> : null}
          <TableSkeleton label="shifts" rows={2} columns={6} />
        </>
      )}
    </PageStack>
  );
}

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
  if (
    state.status !== "loading" &&
    (state.status !== "authenticated" || state.user.role !== role)
  ) {
    return <SessionLoading />;
  }
  const user = state.status === "authenticated" ? state.user : undefined;
  return (
    <AppShell role={role} user={user}>
      {user ? children : <WorkspaceLoading role={role} />}
    </AppShell>
  );
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
