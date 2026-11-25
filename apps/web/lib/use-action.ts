"use client";

import { useCallback, useState } from "react";
import { errorMessage } from "./api";
import { useNotifications } from "./notifications";

/**
 * Runs a user action and puts its result in the notification banner: the success message,
 * or the API's error verbatim. `pending` holds the key of the action in flight.
 */
export function useAction() {
  const { notifySuccess, notifyError } = useNotifications();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (
      key: string,
      action: () => Promise<unknown>,
      successMessage: string,
    ): Promise<boolean> => {
      setPending(key);
      try {
        await action();
        notifySuccess(successMessage);
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
