"use client";

import {
  CancelReasonSchema,
  SUCCESS_MESSAGES,
  TEST_IDS,
  type CancelReason,
  type CancelShiftResponse,
} from "@repo/shared";
import { useId, useState } from "react";
import { CANCEL_REASON_LABEL } from "../lib/format";
import { useApi } from "../lib/session";
import { useAction } from "../lib/use-action";
import { Button } from "./ui/Button";
import { Select } from "./ui/Field";
import styles from "./ShiftCancelControl.module.css";

/**
 * Nurses cancel in advance. Staff can also report a no-show. The reopened shift from
 * the API goes to `onCancelled` before the success toast.
 */
export function ShiftCancelControl({
  shiftId,
  shiftLabel,
  staff = false,
  onCancelled,
}: {
  shiftId: string;
  /** Spoken context for the button and select, e.g. "RN shift shift-1 on Fri, Oct 2". */
  shiftLabel: string;
  staff?: boolean;
  onCancelled: (result: CancelShiftResponse) => void;
}) {
  const api = useApi();
  const { run, pending } = useAction();
  const [reason, setReason] = useState<CancelReason>(
    staff ? "no-show" : "advance",
  );
  const selectId = useId();
  const busy = pending !== null;
  const noShow = reason === "no-show";
  const label = noShow ? "Report no-show" : "Cancel shift";

  async function cancel() {
    if (busy) return;
    await run("cancel", () => api.cancelShift(shiftId, reason), {
      success: SUCCESS_MESSAGES.shiftCancelled,
      apply: onCancelled,
    });
  }

  return (
    <div className={styles.control}>
      {staff ? (
        <>
          <label htmlFor={selectId} className="visually-hidden">
            Cancellation reason for {shiftLabel}
          </label>
          <Select
            id={selectId}
            size="sm"
            className={styles.reason}
            value={reason}
            disabled={busy}
            onChange={(event) =>
              setReason(CancelReasonSchema.parse(event.target.value))
            }
          >
            <option value="no-show">{CANCEL_REASON_LABEL["no-show"]}</option>
            <option value="advance">{CANCEL_REASON_LABEL.advance}</option>
          </Select>
        </>
      ) : null}
      <Button
        variant="danger"
        size="sm"
        busy={busy}
        data-testid={TEST_IDS.shiftCancelButton}
        aria-label={
          noShow ? `Report no-show for ${shiftLabel}` : `Cancel ${shiftLabel}`
        }
        onClick={() => void cancel()}
      >
        {busy ? (noShow ? "Reporting…" : "Cancelling…") : label}
      </Button>
    </div>
  );
}
