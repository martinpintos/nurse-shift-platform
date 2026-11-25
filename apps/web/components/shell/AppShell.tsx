"use client";

import type { MeResponse } from "@repo/shared";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ROLE_LABEL } from "../../lib/roles";
import { useSession } from "../../lib/session";
import { Brand } from "../BrandMark";
import { LogOutIcon } from "../ui/icons";
import { Avatar } from "../ui/Text";
import { ShellContext, type ShellValue } from "./ShellContext";
import { ROLE_SECTIONS, panelOf, panelsOf } from "./sections";
import { useScrollSpy } from "./use-scroll-spy";
import styles from "./AppShell.module.css";

/** Set on <html> while the shell is mounted: the toast docks in the sidebar. */
export const SHELL_ATTRIBUTE = "data-shell";

function AccountMenu({
  user,
  onSignOut,
}: {
  user: MeResponse;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className={styles.account}>
      <button
        type="button"
        className={styles.avatarButton}
        aria-label={`Account: ${user.name}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={user.name} size={36} className={styles.avatarRing} />
      </button>
      <div id={menuId} className={styles.menu} hidden={!open}>
        <p className={styles.menuName}>{user.name}</p>
        <p className={styles.menuRole}>{ROLE_LABEL[user.role]}</p>
        <button
          type="button"
          className={styles.menuSignOut}
          onClick={onSignOut}
        >
          <LogOutIcon size={18} />
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * The signed-in frame. Desktop (960px and up): a navy sidebar with the brand, the role's
 * sections (in-page anchors) and the user card with Sign out. Phones: a top bar with the
 * account menu and bottom tabs that switch panels. The toast docks in the sidebar above the
 * user card; nothing in the shell moves when it appears.
 */
export function AppShell({
  user,
  children,
}: {
  user: MeResponse;
  children: ReactNode;
}) {
  const { logout } = useSession();
  const sections = ROLE_SECTIONS[user.role];
  const panels = panelsOf(sections);
  const [activePanel, setActivePanel] = useState<string>(panels[0]?.id ?? "");
  const currentSection = useScrollSpy(sections.map((section) => section.id));

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(SHELL_ATTRIBUTE, "");
    return () => root.removeAttribute(SHELL_ATTRIBUTE);
  }, []);

  const shell = useMemo<ShellValue>(
    () => ({ activePanel, setActivePanel }),
    [activePanel],
  );

  function showPanel(panel: string) {
    setActivePanel(panel);
    window.scrollTo({ top: 0 });
  }

  return (
    <ShellContext.Provider value={shell}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <aside className={styles.sidebar}>
        <div className={styles.brandRow}>
          <Brand onDark />
        </div>
        <nav className={styles.nav} aria-label="Sections">
          <ul>
            {sections.map((section) => {
              const Icon = section.icon;
              const current = currentSection === section.id;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className={styles.navLink}
                    aria-current={current ? "location" : undefined}
                    onClick={() => setActivePanel(panelOf(section))}
                  >
                    <Icon size={20} />
                    {section.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={styles.userCard}>
          <Avatar name={user.name} size={36} />
          <div className={styles.userText}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userRole}>{ROLE_LABEL[user.role]}</span>
          </div>
          <button
            type="button"
            className={styles.signOut}
            aria-label="Sign out"
            title="Sign out"
            onClick={logout}
          >
            <LogOutIcon size={18} />
          </button>
        </div>
      </aside>

      <header className={styles.topBar}>
        <Brand onDark />
        <AccountMenu user={user} onSignOut={logout} />
      </header>

      <main id="main" className={styles.main} tabIndex={-1}>
        <div className={styles.content}>{children}</div>
      </main>

      <nav className={styles.bottomTabs} aria-label="Sections">
        {panels.map((panel) => {
          const Icon = panel.icon;
          const current = activePanel === panel.id;
          return (
            <button
              key={panel.id}
              type="button"
              className={styles.tab}
              aria-current={current ? "page" : undefined}
              onClick={() => showPanel(panel.id)}
            >
              <Icon size={22} />
              <span>{panel.label}</span>
            </button>
          );
        })}
      </nav>
    </ShellContext.Provider>
  );
}
