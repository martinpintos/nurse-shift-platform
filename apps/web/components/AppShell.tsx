"use client";

import type { MeResponse } from "@repo/shared";
import type { ReactNode } from "react";
import { ROLE_LABEL } from "../lib/roles";
import { useSession } from "../lib/session";
import { Brand } from "./BrandMark";
import { NotificationBanner } from "./NotificationBanner";

/** The signed-in frame: header with the user and sign-out, the banner, the page. */
export function AppShell({
  user,
  children,
}: {
  user: MeResponse;
  children: ReactNode;
}) {
  const { logout } = useSession();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Brand />
          <div className="app-header-user">
            <span className="user-name">{user.name}</span>
            <span className="role-tag">{ROLE_LABEL[user.role]}</span>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="banner-slot">
        <NotificationBanner />
      </div>
      <main id="main" className="page" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
