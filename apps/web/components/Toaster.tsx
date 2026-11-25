"use client";

import { TEST_IDS } from "@repo/shared";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useNotifications, type Notification } from "../lib/notifications";
import { AlertCircleIcon, CheckCircleIcon, CloseIcon } from "./ui/icons";
import styles from "./Toaster.module.css";

/** How long a success toast stays, not counting time hovered or focused. */
export const SUCCESS_TOAST_MS = 10_000;
const TOAST_EXIT_MS = 120;

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Notification;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [closing, setClosing] = useState(false);
  const remaining = useRef(SUCCESS_TOAST_MS);
  const priorFocus = useRef<HTMLElement | null>(null);
  const toastElement = useRef<HTMLDivElement>(null);
  const paused = hovered || focused;
  const autoDismiss = toast.variant === "success";

  function startDismiss() {
    if (closing) return;
    if (toastElement.current?.contains(document.activeElement)) {
      if (priorFocus.current?.isConnected) priorFocus.current.focus();
      if (toastElement.current.contains(document.activeElement)) {
        const fallback =
          document.getElementById("main") ??
          document.querySelector<HTMLElement>("main form button[type=submit]");
        fallback?.focus();
      }
    }
    if (
      window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches
    ) {
      setClosing(true);
    } else {
      onDismiss();
    }
  }

  const dismiss = useEffectEvent(startDismiss);
  const remove = useEffectEvent(onDismiss);

  // Count down only while not paused; pausing keeps the time left.
  useEffect(() => {
    if (!autoDismiss || paused || closing) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => dismiss(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [autoDismiss, paused, closing]);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => remove(), TOAST_EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  const success = toast.variant === "success";
  return (
    <div
      ref={toastElement}
      className={styles.toast}
      data-testid={TEST_IDS.notificationBanner}
      data-variant={toast.variant}
      data-closing={closing || undefined}
      aria-hidden={closing || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => {
        const previous = event.relatedTarget;
        if (
          previous instanceof HTMLElement &&
          !event.currentTarget.contains(previous)
        ) {
          priorFocus.current = previous;
        }
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {success ? <CheckCircleIcon /> : <AlertCircleIcon />}
      </span>
      <p className={styles.message}>{toast.message}</p>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss notification"
        tabIndex={closing ? -1 : undefined}
        onClick={startDismiss}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

/**
 * The one confirmation toast (`notification-banner`) for every action, success or error.
 * It overlays the page, so it never shifts the layout: in the sidebar above the user card on
 * desktop, under the top bar on phones, top center on pages without the shell. At most one
 * exists in the DOM; a new toast replaces the old one. The wrapper is always present, so
 * screen readers announce each new toast.
 */
export function Toaster() {
  const { notification, clear } = useNotifications();
  const pathname = usePathname();
  const visible =
    notification && notification.scope === pathname ? notification : null;
  return (
    <div className={styles.region} role="region" aria-label="Notifications">
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {visible ? (
          <span key={visible.id}>
            {visible.variant === "error" ? "Error. " : ""}
            {visible.message}
          </span>
        ) : null}
      </div>
      {visible ? (
        // Keyed by id: a new toast is a new node, with a fresh timer, announced again.
        <ToastCard key={visible.id} toast={visible} onDismiss={clear} />
      ) : null}
    </div>
  );
}
