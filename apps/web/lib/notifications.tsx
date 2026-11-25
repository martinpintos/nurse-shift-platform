"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type NotificationVariant = "success" | "error";

export interface Notification {
  /** Increments on every notification, so a repeated message is a new toast. */
  id: number;
  variant: NotificationVariant;
  message: string;
  /** The pathname the toast belongs to. Navigating anywhere else drops it. */
  scope: string;
}

export interface NotifyOptions {
  /**
   * The pathname the toast is for. Defaults to the current one; pass the destination when
   * the toast is shown just before a navigation (e.g. "session expired" → /login).
   */
  scope?: string;
}

interface NotificationsValue {
  /** The one toast, or null. A new toast replaces the old one. */
  notification: Notification | null;
  notifySuccess: (message: string, options?: NotifyOptions) => void;
  notifyError: (message: string, options?: NotifyOptions) => void;
  /** Removes the toast (dismiss button, auto-dismiss, logout). */
  clear: () => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Holds the single toast. Success toasts auto-dismiss (see Toaster); errors stay until
 * dismissed. Every toast is dropped on a route change and on logout.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [shownPathname, setShownPathname] = useState(pathname);

  // A route change drops a toast that belongs to another route (adjusting state while
  // rendering, so the stale toast never paints on the new page).
  if (pathname !== shownPathname) {
    setShownPathname(pathname);
    if (notification && notification.scope !== pathname) setNotification(null);
  }

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // The setters are stable, so code that depends on them (the API client's 401 handler)
  // isn't rebuilt every time the message changes.
  const show = useCallback(
    (
      variant: NotificationVariant,
      message: string,
      options?: NotifyOptions,
    ) => {
      setNotification((previous) => ({
        id: (previous?.id ?? 0) + 1,
        variant,
        message,
        scope: options?.scope ?? pathnameRef.current,
      }));
    },
    [],
  );
  const notifySuccess = useCallback(
    (message: string, options?: NotifyOptions) =>
      show("success", message, options),
    [show],
  );
  const notifyError = useCallback(
    (message: string, options?: NotifyOptions) =>
      show("error", message, options),
    [show],
  );
  const clear = useCallback(() => setNotification(null), []);

  const value = useMemo<NotificationsValue>(
    () => ({ notification, notifySuccess, notifyError, clear }),
    [notification, notifySuccess, notifyError, clear],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) {
    throw new Error(
      "useNotifications must be used inside NotificationProvider",
    );
  }
  return value;
}
