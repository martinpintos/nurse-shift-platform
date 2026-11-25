"use client";

import { useEffect, useEffectEvent, useState } from "react";

export const POLL_INTERVAL_MS = 5000;

function isHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

/**
 * Calls `onTick` every `intervalMs` while the tab is visible. Polling stops while the tab is
 * hidden, and on return it ticks at once and resumes. Returns whether polling is paused.
 */
export function usePolling(
  onTick: () => void,
  intervalMs: number = POLL_INTERVAL_MS,
): { paused: boolean } {
  const [paused, setPaused] = useState(isHidden);
  const tick = useEffectEvent(onTick);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer === undefined) timer = setInterval(() => tick(), intervalMs);
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (isHidden()) {
        stop();
        setPaused(true);
      } else if (timer === undefined) {
        setPaused(false);
        tick();
        start();
      }
    };

    if (!isHidden()) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return { paused };
}
