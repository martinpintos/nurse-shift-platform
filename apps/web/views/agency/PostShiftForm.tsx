"use client";

import {
  ShiftRoleSchema,
  SUCCESS_MESSAGES,
  TEST_IDS,
  type CreateShiftRequest,
} from "@repo/shared";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { shiftLength, tomorrowIsoDate } from "../../lib/format";
import { useApi } from "../../lib/session";
import { useAction } from "../../lib/use-action";

/** Valid defaults, so submitting the untouched form posts a shift: RN, tomorrow, 07:00–19:00. */
export function defaultShiftRequest(
  now: Date = new Date(),
): CreateShiftRequest {
  return {
    role: "RN",
    date: tomorrowIsoDate(now),
    startTime: "07:00",
    endTime: "19:00",
  };
}

export function PostShiftForm({
  id,
  onPosted,
  onClose,
}: {
  id: string;
  onPosted: () => void;
  onClose: () => void;
}) {
  const api = useApi();
  const { run, pending } = useAction();
  const [values, setValues] = useState<CreateShiftRequest>(() =>
    defaultShiftRequest(),
  );
  const firstField = useRef<HTMLSelectElement>(null);
  const ids = {
    heading: useId(),
    role: useId(),
    date: useId(),
    start: useId(),
    end: useId(),
  };

  // Opening the form moves focus into it.
  useEffect(() => {
    firstField.current?.focus();
  }, []);

  function update<K extends keyof CreateShiftRequest>(
    key: K,
    value: CreateShiftRequest[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const done = await run(
      "post",
      () => api.postShift(values),
      SUCCESS_MESSAGES.shiftPosted,
    );
    // The form stays open with its values, so similar shifts are quick to post.
    if (done) onPosted();
  }

  const length =
    values.startTime && values.endTime && values.startTime !== values.endTime
      ? shiftLength(values.startTime, values.endTime)
      : null;

  return (
    <section id={id} className="card post-shift" aria-labelledby={ids.heading}>
      <div className="section-header">
        <h2 id={ids.heading}>Post a new shift</h2>
      </div>
      <form className="post-shift-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor={ids.role}>Role</label>
          <select
            ref={firstField}
            id={ids.role}
            className="select"
            value={values.role}
            onChange={(event) =>
              update("role", ShiftRoleSchema.parse(event.target.value))
            }
          >
            {ShiftRoleSchema.options.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.date}>Date</label>
          <input
            id={ids.date}
            className="input"
            type="date"
            required
            value={values.date}
            onChange={(event) => update("date", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={ids.start}>Start</label>
          <input
            id={ids.start}
            className="input"
            type="time"
            required
            value={values.startTime}
            onChange={(event) => update("startTime", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={ids.end}>End</label>
          <input
            id={ids.end}
            className="input"
            type="time"
            required
            value={values.endTime}
            onChange={(event) => update("endTime", event.target.value)}
          />
        </div>
        <p className="post-shift-summary muted small">
          {length
            ? `${length}${values.endTime < values.startTime ? ", overnight" : ""} · `
            : null}
          Times are facility-local.
        </p>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            data-testid={TEST_IDS.agencyPostShiftSubmitButton}
            aria-disabled={pending !== null || undefined}
          >
            {pending ? "Posting…" : "Post shift"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </section>
  );
}
