"use client";

import { useCallback, useState } from "react";
import { errorMessage } from "./api";
import { useNotifications } from "./notifications";

export interface ActionOptions<T> {
  /** The success toast. */
  success: string;
  /**
   * Puts the API's response into the view (usually a `Resource.mutate`). Runs before the
   * success toast, so the next click always acts on the current state.
   */
  apply?: (result: T) => void;
}

/**
 * Runs a user action and reports it in the toast: the success message, or the API's error
 * verbatim. `pending` holds the key of the action in flight.
 */
export function useAction() {
  const { notifySuccess, notifyError } = useNotifications();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async <T>(
      key: string,
      action: () => Promise<T>,
      options: ActionOptions<T> | string,
    ): Promise<boolean> => {
      const { success, apply } =
        typeof options === "string"
          ? { success: options, apply: undefined }
          : options;
      setPending(key);
      try {
        const result = await action();
        apply?.(result);
        notifySuccess(success);
        return true;
      } catch (error) {
        notifyError(errorMessage(error));
        return false;
      } finally {
        setPending(null);
      }
    },
    [notifySuccess, notifyError],
  );

  return { run, pending };
}
