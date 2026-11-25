"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./api";

export interface Resource<T> {
  /** The last successful result. Kept while reloading, so lists don't flash. */
  data: T | undefined;
  /** The last load's error message, cleared by the next success. */
  error: string | null;
  /** True until the first load settles. */
  loading: boolean;
  /** When the data last loaded successfully. */
  updatedAt: Date | null;
  reload: () => void;
}

interface ResourceState<T> {
  data: T | undefined;
  error: string | null;
  settled: boolean;
  updatedAt: Date | null;
}

/**
 * Loads data for a view. `load` must be stable (wrap it in useCallback); `reload()` fetches
 * again, and a response that arrives after a newer reload started is dropped.
 */
export function useResource<T>(load: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({
    data: undefined,
    error: null,
    settled: false,
    updatedAt: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => {
        if (active) {
          setState({ data, error: null, settled: true, updatedAt: new Date() });
        }
      },
      (error: unknown) => {
        if (active) {
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

  return {
    data: state.data,
    error: state.error,
    loading: !state.settled,
    updatedAt: state.updatedAt,
    reload,
  };
}
