"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type NotificationVariant = "success" | "error";

export interface Notification {
  /** Increments on every notification, so a repeated message is re-announced. */
  id: number;
  variant: NotificationVariant;
  message: string;
}

interface NotificationsValue {
  notification: Notification | null;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
  clear: () => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Holds the one banner message. It stays until the next action's result replaces it:
 * there is no auto-dismiss, and it survives client-side navigation.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);

  // The setters are stable, so code that depends on them (the API client's 401 handler)
  // isn't rebuilt every time the message changes.
  const show = useCallback((variant: NotificationVariant, message: string) => {
    setNotification((previous) => ({
      id: (previous?.id ?? 0) + 1,
      variant,
      message,
    }));
  }, []);
  const notifySuccess = useCallback(
    (message: string) => show("success", message),
    [show],
  );
  const notifyError = useCallback(
    (message: string) => show("error", message),
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
