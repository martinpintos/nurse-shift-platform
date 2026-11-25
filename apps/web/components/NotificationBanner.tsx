"use client";

import { TEST_IDS } from "@repo/shared";
import { useNotifications } from "../lib/notifications";

function SuccessIcon() {
  return (
    <svg
      role="img"
      aria-label="Success:"
      viewBox="0 0 20 20"
      width="20"
      height="20"
    >
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.16" />
      <path
        d="M6 10.4l2.6 2.6L14 7.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      role="img"
      aria-label="Error:"
      viewBox="0 0 20 20"
      width="20"
      height="20"
    >
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.16" />
      <path
        d="M10 5.5v5.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.2" r="1.15" fill="currentColor" />
    </svg>
  );
}

/**
 * The one confirmation banner for every action, success or error. Same test ID for both;
 * they differ by content and `data-variant`. The live region is always in the DOM (empty
 * until the first action), so screen readers announce each new message. Its text content is
 * exactly the message; the icon's label adds "Success:" or "Error:" for screen readers.
 */
export function NotificationBanner() {
  const { notification } = useNotifications();
  return (
    <div
      className="banner"
      data-testid={TEST_IDS.notificationBanner}
      data-variant={notification?.variant}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {notification ? (
        // Keyed by id so a repeated message is a new node and is announced again.
        <p key={notification.id} className="banner-message">
          {notification.variant === "success" ? <SuccessIcon /> : <ErrorIcon />}
          <span>{notification.message}</span>
        </p>
      ) : null}
    </div>
  );
}
