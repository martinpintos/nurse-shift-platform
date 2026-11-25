"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

export interface Resource<T> {
  /** The last successful result. Kept while reloading, so lists don't flash. */
  data: T | undefined;
  /** The last load's error message, cleared by the next success. */
  error: string | null;
  /** True until the first load settles: show a skeleton. */
  loading: boolean;
  /** When the data last loaded successfully. */
  updatedAt: Date | null;
  reload: () => void;
  /**
   * Applies an action's result (e.g. the shift a claim returned) at once. Loads already in
   * flight are dropped, so a poll that started before the action can't bring back the old
   * state. Ignored until the first load has data.
   */
  mutate: (update: (data: T) => T) => void;
}

interface ResourceState<T> {
  data: T | undefined;
  error: string | null;
  settled: boolean;
  updatedAt: Date | null;
}

/**
 * Loads data for a view. `load` must be stable (wrap it in useCallback); `reload()` fetches
 * again, and a response that arrives after a newer reload (or a `mutate`) is dropped.
 */
export function useResource<T>(load: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({
    data: undefined,
    error: null,
    settled: false,
    updatedAt: null,
  });
  const [version, setVersion] = useState(0);
  // Bumped by every load and every mutate; a response only lands if it is still current.
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    const isCurrent = () => active && generation.current === current;
    load().then(
      (data) => {
        if (isCurrent()) {
          setState({ data, error: null, settled: true, updatedAt: new Date() });
        }
      },
      (error: unknown) => {
        if (isCurrent()) {
          setState((previous) => ({
            ...previous,
            error: errorMessage(error),
            settled: true,
          }));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [load, version]);

  const reload = useCallback(() => setVersion((n) => n + 1), []);

  const mutate = useCallback((update: (data: T) => T) => {
    generation.current += 1;
    setState((previous) =>
      previous.data === undefined
        ? previous
        : { ...previous, data: update(previous.data), error: null },
    );
  }, []);

  return {
    data: state.data,
    error: state.error,
    loading: !state.settled,
    updatedAt: state.updatedAt,
    reload,
    mutate,
  };
}
