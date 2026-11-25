"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { CloseIcon } from "./icons";
import styles from "./Drawer.module.css";

/** Set on <html> while a drawer is open, so the shell makes room for it. */
export const DRAWER_OPEN_ATTRIBUTE = "data-drawer-open";

/**
 * A non-modal side panel, as in the agency design: the page stays visible and usable next
 * to it (the shell narrows the content), with no scrim. On phones it covers the screen.
 * Mount it only while open. Escape closes it; focus moves in on open and goes back to the
 * element that opened it on close.
 */
export function Drawer({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const root = document.documentElement;
    root.setAttribute(DRAWER_OPEN_ATTRIBUTE, "");
    panel.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      root.removeAttribute(DRAWER_OPEN_ATTRIBUTE);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      ref={panel}
      className={styles.drawer}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
    >
      <div className={styles.header}>
        <h2 id={headingId}>{title}</h2>
        <button
          type="button"
          className={styles.close}
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}
