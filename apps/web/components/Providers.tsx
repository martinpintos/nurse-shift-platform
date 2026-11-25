"use client";

import type { ReactNode } from "react";
import { NotificationProvider } from "../lib/notifications";
import { SessionProvider } from "../lib/session";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <SessionProvider>{children}</SessionProvider>
    </NotificationProvider>
  );
}
