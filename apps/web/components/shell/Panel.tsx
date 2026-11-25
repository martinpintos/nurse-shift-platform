"use client";

import type { ReactNode } from "react";
import { useShell } from "./ShellContext";
import styles from "./Panel.module.css";

/**
 * Content that belongs to one bottom tab on phones. Below 960px only the active tab's panels
 * show (CSS only: the DOM is the same at every width). On desktop every panel shows.
 */
export function Panel({
  id,
  className,
  children,
}: {
  /** A section id from ROLE_SECTIONS that owns a panel (has no `panel` of its own). */
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const shell = useShell();
  const active = !shell || shell.activePanel === id;
  return (
    <div
      className={className ? `${styles.panel} ${className}` : styles.panel}
      data-panel={id}
      data-inactive={active ? undefined : ""}
    >
      {children}
    </div>
  );
}
