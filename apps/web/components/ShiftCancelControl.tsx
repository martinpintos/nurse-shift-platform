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

export interface CancelReasonOption {
  value: CancelReason;
  label: string;
  /** Shown but not selectable, to explain a rule (a nurse can't report a no-show). */
  disabled?: boolean;
}

/** Nurses cancel their own claims in advance only; the no-show option explains why. */
export const NURSE_CANCEL_OPTIONS: CancelReasonOption[] = [
  { value: "advance", label: CANCEL_REASON_LABEL.advance },
  {
    value: "no-show",
    label: `${CANCEL_REASON_LABEL["no-show"]} (agency or admin only)`,
    disabled: true,
  },
];

/** Agencies and admins report no-shows first, or cancel in advance. */
export const STAFF_CANCEL_OPTIONS: CancelReasonOption[] = [
  { value: "no-show", label: CANCEL_REASON_LABEL["no-show"] },
  { value: "advance", label: CANCEL_REASON_LABEL.advance },
];

/**
 * A reason select (defaulting to the first allowed option) and the cancel button, side by
 * side. One click cancels: no dialog. The reopened shift from the API's response goes to
 * `onCancelled` before the success toast.
 */
export function ShiftCancelControl({
  shiftId,
  shiftLabel,
  options,
  onCancelled,
}: {
  shiftId: string;
  /** Spoken context for the button and select, e.g. "RN shift shift-1 on Fri, Oct 2". */
  shiftLabel: string;
  options: CancelReasonOption[];
  onCancelled: (result: CancelShiftResponse) => void;
}) {
  const api = useApi();
  const { run, pending } = useAction();
  const defaultReason =
    options.find((option) => !option.disabled)?.value ?? "advance";
  const [reason, setReason] = useState<CancelReason>(defaultReason);
  const selectId = useId();
  const busy = pending !== null;

  async function cancel() {
    if (busy) return;
    await run("cancel", () => api.cancelShift(shiftId, reason), {
      success: SUCCESS_MESSAGES.shiftCancelled,
      apply: onCancelled,
    });
  }

  return (
    <div className={styles.control}>
      <label htmlFor={selectId} className="visually-hidden">
        Cancellation reason for {shiftLabel}
      </label>
      <Select
        id={selectId}
        size="sm"
        className={styles.reason}
        value={reason}
        onChange={(event) =>
          setReason(CancelReasonSchema.parse(event.target.value))
        }
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </Select>
      <Button
        variant="danger"
        size="sm"
        busy={busy}
        data-testid={TEST_IDS.shiftCancelButton}
        aria-label={`Cancel ${shiftLabel}`}
        onClick={() => void cancel()}
      >
        {busy ? "Cancelling…" : "Cancel shift"}
      </Button>
    </div>
  );
}
