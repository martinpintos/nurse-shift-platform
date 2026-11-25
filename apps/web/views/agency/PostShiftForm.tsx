"use client";

import {
  ShiftRoleSchema,
  SUCCESS_MESSAGES,
  TEST_IDS,
  type CreateShiftRequest,
  type Shift,
} from "@repo/shared";
import { useId, useState, type FormEvent } from "react";
import { shiftEndNote } from "../../components/ShiftSummary";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { Field, Input, Select } from "../../components/ui/Field";
import { shiftLength, tomorrowIsoDate } from "../../lib/format";
import { useApi } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import styles from "./PostShiftForm.module.css";

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

/**
 * The post-shift drawer. Its defaults are valid, so Post shift works untouched. On success
 * the posted shift from the response goes to `onPosted` before the toast, and the drawer
 * closes; on an error it stays open with the values.
 */
export function PostShiftDrawer({
  onPosted,
  onClose,
}: {
  onPosted: (shift: Shift) => void;
  onClose: () => void;
}) {
  const api = useApi();
  const { run, pending } = useAction();
  const [values, setValues] = useState<CreateShiftRequest>(() =>
    defaultShiftRequest(),
  );
  const formId = useId();

  function update<K extends keyof CreateShiftRequest>(
    key: K,
    value: CreateShiftRequest[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const done = await run("post", () => api.postShift(values), {
      success: SUCCESS_MESSAGES.shiftPosted,
      apply: onPosted,
    });
    if (done) onClose();
  }

  const complete =
    values.date !== "" &&
    values.startTime !== "" &&
    values.endTime !== "" &&
    values.startTime !== values.endTime;

  return (
    <Drawer
      title="Post shift"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            busy={pending !== null}
            data-testid={TEST_IDS.agencyPostShiftSubmitButton}
          >
            {pending ? "Posting…" : "Post shift"}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={onSubmit}>
        <Field label="Role">
          {({ id }) => (
            <Select
              id={id}
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
            </Select>
          )}
        </Field>
        <Field label="Shift date">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              required
              value={values.date}
              onChange={(event) => update("date", event.target.value)}
            />
          )}
        </Field>
        <div className={styles.times}>
          <Field label="Start time">
            {({ id }) => (
              <Input
                id={id}
                type="time"
                required
                value={values.startTime}
                onChange={(event) => update("startTime", event.target.value)}
              />
            )}
          </Field>
          <Field label="End time">
            {({ id }) => (
              <Input
                id={id}
                type="time"
                required
                value={values.endTime}
                onChange={(event) => update("endTime", event.target.value)}
              />
            )}
          </Field>
        </div>
        <p className={styles.summary} aria-live="polite">
          {complete
            ? `${shiftEndNote(values).startsWith("Ends") ? `${shiftEndNote(values)} · ` : ""}${shiftLength(values.startTime, values.endTime)} · facility-local time`
            : "Start and end must differ. Times are facility-local."}
        </p>
      </form>
    </Drawer>
  );
}
