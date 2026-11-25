"use client";

import { createContext, useContext } from "react";

export interface ShellValue {
  /** The bottom tab shown on phones. Desktop shows every panel. */
  activePanel: string;
  setActivePanel: (panel: string) => void;
}

export const ShellContext = createContext<ShellValue | null>(null);

/** Outside the shell (tests rendering a view alone) every panel counts as active. */
export function useShell(): ShellValue | null {
  return useContext(ShellContext);
}
