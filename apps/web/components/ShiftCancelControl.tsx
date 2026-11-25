"use client";

import {
  CancelReasonSchema,
  SUCCESS_MESSAGES,
  TEST_IDS,
  type CancelReason,
} from "@repo/shared";
import { useId, useState } from "react";
import { CANCEL_REASON_LABEL } from "../lib/format";
import { useApi } from "../lib/session";
import { useAction } from "../lib/use-action";

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
 * A reason select (defaulting to the first allowed option) and the cancel button. One click
 * cancels: no modal, no confirm. The result goes to the notification banner.
 */
export function ShiftCancelControl({
  shiftId,
  shiftLabel,
  options,
  onCancelled,
}: {
  shiftId: string;
  /** Spoken context for the button and select, e.g. "RN shift on Fri, Oct 3". */
  shiftLabel: string;
  options: CancelReasonOption[];
  onCancelled: () => void;
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
    const done = await run(
      "cancel",
      () => api.cancelShift(shiftId, reason),
      SUCCESS_MESSAGES.shiftCancelled,
    );
    if (done) onCancelled();
  }

  return (
    <div className="cancel-control">
      <label htmlFor={selectId} className="visually-hidden">
        Cancellation reason for {shiftLabel}
      </label>
      <select
        id={selectId}
        className="select select-small"
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
      </select>
      <button
        type="button"
        className="btn btn-danger btn-small"
        data-testid={TEST_IDS.shiftCancelButton}
        aria-label={`Cancel ${shiftLabel}`}
        aria-disabled={busy || undefined}
        onClick={cancel}
      >
        {busy ? "Cancelling…" : "Cancel shift"}
      </button>
    </div>
  );
}
