"use client";

import { TEST_IDS } from "@repo/shared";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useNotifications, type Notification } from "../lib/notifications";
import { AlertCircleIcon, CheckCircleIcon, CloseIcon } from "./ui/icons";
import styles from "./Toaster.module.css";

/** How long a success toast stays, not counting time hovered or focused. */
export const SUCCESS_TOAST_MS = 6000;

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Notification;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(SUCCESS_TOAST_MS);
  const dismiss = useEffectEvent(onDismiss);
  const paused = hovered || focused;
  const autoDismiss = toast.variant === "success";

  // Count down only while not paused; pausing keeps the time left.
  useEffect(() => {
    if (!autoDismiss || paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => dismiss(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [autoDismiss, paused]);

  const success = toast.variant === "success";
  return (
    <div
      className={styles.toast}
      data-testid={TEST_IDS.notificationBanner}
      data-variant={toast.variant}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <span className={styles.icon}>
        {success ? (
          <CheckCircleIcon
            role="img"
            aria-label="Success:"
            aria-hidden={false}
          />
        ) : (
          <AlertCircleIcon role="img" aria-label="Error:" aria-hidden={false} />
        )}
      </span>
      <p className={styles.message}>{toast.message}</p>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss notification"
        onClick={onDismiss}
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
    <div className={styles.region} aria-live="polite">
      {visible ? (
        // Keyed by id: a new toast is a new node, with a fresh timer, announced again.
        <ToastCard key={visible.id} toast={visible} onDismiss={clear} />
      ) : null}
    </div>
  );
}
