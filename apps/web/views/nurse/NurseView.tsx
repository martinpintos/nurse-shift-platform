"use client";

import {
  SUCCESS_MESSAGES,
  TEST_IDS,
  timesheetMinutes,
  type Shift,
  type Timesheet,
} from "@repo/shared";
import { useCallback, useId, useState, type FormEvent } from "react";
import {
  NURSE_CANCEL_OPTIONS,
  ShiftCancelControl,
} from "../../components/ShiftCancelControl";
import {
  ShiftWhen,
  byDateAndTime,
  shiftLabel,
} from "../../components/ShiftSummary";
import { TimesheetTable } from "../../components/TimesheetTable";
import { Badge, PageHeader, Section, SectionState } from "../../components/ui";
import { formatMinutes, formatTimeRange } from "../../lib/format";
import { useNotifications } from "../../lib/notifications";
import { useApi, useCurrentUser } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import { useResource } from "../../lib/use-resource";
import { CredentialStatusNote, CredentialsPanel } from "./CredentialsPanel";

/** Client-side only: a timesheet needs different start and end times. */
export const SAME_TIMES_MESSAGE = "End time must be different from start time";

function OpenShiftList({
  shifts,
  onChanged,
}: {
  shifts: Shift[];
  onChanged: () => void;
}) {
  const api = useApi();
  const { run, pending } = useAction();

  async function claim(shift: Shift) {
    if (pending) return;
    await run(
      `claim:${shift.id}`,
      () => api.claimShift(shift.id),
      SUCCESS_MESSAGES.shiftClaimed,
    );
    // Refresh either way: a failed claim may mean someone else just took it.
    onChanged();
  }

  return (
    <ul className="shift-grid" aria-label="Open shifts">
      {shifts.map((shift) => {
        const claiming = pending === `claim:${shift.id}`;
        return (
          <li
            key={shift.id}
            className="shift-card"
            data-testid={TEST_IDS.shiftListItem}
          >
            <div className="shift-card-top">
              <Badge tone="accent">{shift.role}</Badge>
              <span className="shift-agency">{shift.agencyName}</span>
            </div>
            <ShiftWhen shift={shift} />
            <span className="mono muted small">{shift.id}</span>
            {shift.status === "open" ? (
              <button
                type="button"
                className="btn btn-primary btn-block"
                data-testid={TEST_IDS.shiftClaimButton}
                aria-label={`Claim ${shiftLabel(shift)}`}
                aria-disabled={pending !== null || undefined}
                onClick={() => void claim(shift)}
              >
                {claiming ? "Claiming…" : "Claim shift"}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TimesheetEntryForm({
  shift,
  onSubmitted,
}: {
  shift: Shift;
  onSubmitted: () => void;
}) {
  const api = useApi();
  const { notifyError } = useNotifications();
  const { run, pending } = useAction();
  const [actualStart, setActualStart] = useState(shift.startTime);
  const [actualEnd, setActualEnd] = useState(shift.endTime);
  const startId = useId();
  const endId = useId();
  const valid =
    actualStart !== "" && actualEnd !== "" && actualStart !== actualEnd;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (actualStart === actualEnd) {
      notifyError(SAME_TIMES_MESSAGE);
      return;
    }
    const done = await run(
      "timesheet",
      () => api.submitTimesheet({ shiftId: shift.id, actualStart, actualEnd }),
      SUCCESS_MESSAGES.timesheetSubmitted,
    );
    if (done) onSubmitted();
  }

  return (
    <form className="timesheet-form" onSubmit={onSubmit}>
      <fieldset>
        <legend>Log actual hours</legend>
        <div className="timesheet-fields">
          <div className="field field-compact">
            <label htmlFor={startId}>Start</label>
            <input
              id={startId}
              className="input"
              type="time"
              required
              value={actualStart}
              onChange={(event) => setActualStart(event.target.value)}
            />
          </div>
          <div className="field field-compact">
            <label htmlFor={endId}>End</label>
            <input
              id={endId}
              className="input"
              type="time"
              required
              value={actualEnd}
              onChange={(event) => setActualEnd(event.target.value)}
            />
          </div>
          <span className="timesheet-total muted small nums" aria-live="off">
            {valid
              ? formatMinutes(timesheetMinutes(actualStart, actualEnd))
              : "—"}
          </span>
          <button
            type="submit"
            className="btn btn-secondary btn-small"
            aria-label={`Submit timesheet for ${shiftLabel(shift)}`}
            aria-disabled={pending !== null || undefined}
          >
            {pending ? "Submitting…" : "Submit timesheet"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function MyShiftList({
  shifts,
  timesheets,
  onShiftsChanged,
  onTimesheetsChanged,
}: {
  shifts: Shift[];
  timesheets: Timesheet[];
  onShiftsChanged: () => void;
  onTimesheetsChanged: () => void;
}) {
  return (
    <ul className="my-shift-list" aria-label="Your claimed shifts">
      {shifts.map((shift) => {
        const timesheet = timesheets.find(
          (entry) => entry.shiftId === shift.id,
        );
        return (
          <li key={shift.id} className="my-shift">
            <div className="my-shift-main">
              <div className="shift-card-top">
                <Badge tone="success">{shift.status}</Badge>
                <Badge tone="neutral">{shift.role}</Badge>
                <span className="shift-agency">{shift.agencyName}</span>
              </div>
              <ShiftWhen shift={shift} />
              <span className="mono muted small">{shift.id}</span>
            </div>
            <div className="my-shift-actions">
              {timesheet ? (
                <p className="small">
                  Timesheet{" "}
                  <Badge
                    tone={
                      timesheet.status === "approved" ? "success" : "warning"
                    }
                  >
                    {timesheet.status}
                  </Badge>{" "}
                  <span className="nums">
                    {formatTimeRange(
                      timesheet.actualStart,
                      timesheet.actualEnd,
                    )}
                  </span>
                </p>
              ) : shift.status === "filled" ? (
                <TimesheetEntryForm
                  shift={shift}
                  onSubmitted={onTimesheetsChanged}
                />
              ) : null}
              {shift.status === "filled" ? (
                <ShiftCancelControl
                  shiftId={shift.id}
                  shiftLabel={shiftLabel(shift)}
                  options={NURSE_CANCEL_OPTIONS}
                  onCancelled={onShiftsChanged}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NurseView() {
  const user = useCurrentUser();
  const api = useApi();
  const shifts = useResource(useCallback(() => api.listShifts(), [api]));
  const timesheets = useResource(
    useCallback(() => api.listTimesheets(), [api]),
  );
  const credentials = useResource(
    useCallback(() => api.listCredentials(), [api]),
  );

  const allShifts = shifts.data?.shifts ?? [];
  const openShifts = allShifts
    .filter((shift) => shift.status === "open")
    .sort(byDateAndTime);
  const myShifts = allShifts
    .filter((shift) => shift.status === "filled" && shift.claimedBy === user.id)
    .sort(byDateAndTime);
  const myTimesheets = timesheets.data?.timesheets ?? [];

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        description="Claim open shifts, log your hours and keep your license current."
      />
      <div className="layout-split">
        <div className="layout-main">
          <Section
            title="Open shifts"
            description="Across all agencies. Claims check your license against the shift date."
            actions={<span className="count">{openShifts.length}</span>}
          >
            <SectionState
              loading={shifts.loading}
              error={shifts.error}
              empty={openShifts.length === 0}
              emptyText="No open shifts right now. New postings show up here."
            >
              <OpenShiftList shifts={openShifts} onChanged={shifts.reload} />
            </SectionState>
          </Section>

          <Section
            title="My shifts"
            description="Log your actual hours after each shift. You can cancel in advance."
            actions={<span className="count">{myShifts.length}</span>}
          >
            <SectionState
              loading={shifts.loading}
              error={shifts.error}
              empty={myShifts.length === 0}
              emptyText="You haven’t claimed any shifts yet."
            >
              <MyShiftList
                shifts={myShifts}
                timesheets={myTimesheets}
                onShiftsChanged={shifts.reload}
                onTimesheetsChanged={timesheets.reload}
              />
            </SectionState>
          </Section>

          <Section title="My timesheets">
            <SectionState
              loading={timesheets.loading}
              error={timesheets.error}
              empty={false}
              emptyText=""
            >
              <TimesheetTable timesheets={myTimesheets} showNurse={false} />
            </SectionState>
          </Section>
        </div>

        <aside className="layout-side" aria-label="License">
          <Section title="License & credentials">
            <CredentialStatusNote credentials={credentials.data?.credentials} />
            {credentials.error ? (
              <p className="section-state load-error" role="alert">
                Couldn’t load your documents: {credentials.error}
              </p>
            ) : null}
            <CredentialsPanel
              credentials={credentials.data?.credentials ?? []}
              onUploaded={credentials.reload}
            />
          </Section>
        </aside>
      </div>
    </>
  );
}
