"use client";

import {
  SUCCESS_MESSAGES,
  TEST_IDS,
  timesheetMinutes,
  type CancelShiftResponse,
  type Credential,
  type Shift,
  type ShiftListResponse,
  type Timesheet,
  type TimesheetListResponse,
} from "@repo/shared";
import {
  useCallback,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  NURSE_CANCEL_OPTIONS,
  ShiftCancelControl,
} from "../../components/ShiftCancelControl";
import {
  ShiftHours,
  byDateAndTime,
  replaceShift,
  shiftEndNote,
  shiftLabel,
} from "../../components/ShiftSummary";
import { TimesheetTable } from "../../components/TimesheetTable";
import { Panel } from "../../components/shell/Panel";
import { StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Field";
import { ListGroupHeader, ListPanel } from "../../components/ui/List";
import {
  EmptyState,
  LoadError,
  PageHeader,
  PageStack,
  Section,
} from "../../components/ui/Section";
import {
  BlockSkeleton,
  ListSkeleton,
  TableSkeleton,
} from "../../components/ui/Skeleton";
import { IdText } from "../../components/ui/Text";
import {
  formatDay,
  formatHours,
  formatMinutes,
  formatTimeRange,
} from "../../lib/format";
import { createLookup } from "../../lib/lookup";
import { useNotifications } from "../../lib/notifications";
import { useApi, useCurrentUser } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import { useResource } from "../../lib/use-resource";
import { CredentialsPanel, currentCredential } from "./CredentialsPanel";
import styles from "./NurseView.module.css";

/** Client-side only: a timesheet needs different start and end times. */
export const SAME_TIMES_MESSAGE = "End time must be different from start time";

const ALL = "all";

function OpenShiftList({
  shifts,
  onClaimed,
  onRefresh,
}: {
  shifts: Shift[];
  onClaimed: (shift: Shift) => void;
  onRefresh: () => void;
}) {
  const api = useApi();
  const { run, pending } = useAction();

  async function claim(shift: Shift) {
    if (pending) return;
    const done = await run(
      `claim:${shift.id}`,
      () => api.claimShift(shift.id),
      {
        success: SUCCESS_MESSAGES.shiftClaimed,
        apply: onClaimed,
      },
    );
    // A failed claim may mean someone else just took it: show the current list.
    if (!done) onRefresh();
  }

  const days = [...new Set(shifts.map((shift) => shift.date))];
  return (
    <ListPanel label="Open shifts">
      {days.map((day) => (
        <DayGroup key={day} day={day}>
          {shifts
            .filter((shift) => shift.date === day)
            .map((shift) => {
              const claiming = pending === `claim:${shift.id}`;
              return (
                <li
                  key={shift.id}
                  className={styles.openRow}
                  data-testid={TEST_IDS.shiftListItem}
                >
                  <div className={styles.what}>
                    <strong className={styles.role}>{shift.role}</strong>
                    <span className={styles.sub}>
                      {shift.agencyName} <IdText>{shift.id}</IdText>
                    </span>
                  </div>
                  <div className={styles.when}>
                    <strong className="nums nowrap">
                      {formatTimeRange(shift.startTime, shift.endTime)}
                    </strong>
                    <span className={styles.sub}>{shiftEndNote(shift)}</span>
                  </div>
                  {shift.status === "open" ? (
                    <Button
                      variant="primary"
                      className={styles.claim}
                      busy={pending !== null}
                      data-testid={TEST_IDS.shiftClaimButton}
                      aria-label={`Claim ${shiftLabel(shift)}`}
                      onClick={() => void claim(shift)}
                    >
                      {claiming ? "Claiming…" : "Claim shift"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
        </DayGroup>
      ))}
    </ListPanel>
  );
}

/** A date band followed by that day's rows, flattened into the one list. */
function DayGroup({ day, children }: { day: string; children: ReactNode }) {
  return (
    <>
      <ListGroupHeader>{formatDay(day)}</ListGroupHeader>
      {children}
    </>
  );
}

function TimesheetEntryForm({
  shift,
  onSubmitted,
}: {
  shift: Shift;
  onSubmitted: (timesheet: Timesheet) => void;
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
    await run(
      "timesheet",
      () => api.submitTimesheet({ shiftId: shift.id, actualStart, actualEnd }),
      { success: SUCCESS_MESSAGES.timesheetSubmitted, apply: onSubmitted },
    );
  }

  return (
    <form className={styles.timesheetForm} onSubmit={onSubmit}>
      <span className={styles.formLabel} aria-hidden="true">
        Hours worked
      </span>
      <label htmlFor={startId} className="visually-hidden">
        Start
      </label>
      <Input
        id={startId}
        size="sm"
        type="time"
        required
        className={styles.time}
        value={actualStart}
        onChange={(event) => setActualStart(event.target.value)}
      />
      <span aria-hidden="true" className={styles.dash}>
        –
      </span>
      <label htmlFor={endId} className="visually-hidden">
        End
      </label>
      <Input
        id={endId}
        size="sm"
        type="time"
        required
        className={styles.time}
        value={actualEnd}
        onChange={(event) => setActualEnd(event.target.value)}
      />
      <span className={styles.total} aria-live="off">
        {valid ? formatMinutes(timesheetMinutes(actualStart, actualEnd)) : "—"}
      </span>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        busy={pending !== null}
        aria-label={`Submit timesheet for ${shiftLabel(shift)}`}
      >
        {pending ? "Submitting…" : "Submit timesheet"}
      </Button>
    </form>
  );
}

function MyShiftList({
  shifts,
  timesheets,
  onCancelled,
  onTimesheetSubmitted,
}: {
  shifts: Shift[];
  timesheets: Timesheet[];
  onCancelled: (result: CancelShiftResponse) => void;
  onTimesheetSubmitted: (timesheet: Timesheet) => void;
}) {
  return (
    <ListPanel label="Your claimed shifts">
      {shifts.map((shift) => {
        const timesheet = timesheets.find(
          (entry) => entry.shiftId === shift.id,
        );
        return (
          <li key={shift.id} className={styles.myRow}>
            <div className={styles.myTop}>
              <div className={styles.myWhen}>
                <strong className="nowrap">{formatDay(shift.date)}</strong>
                <span className={styles.sub}>
                  <ShiftHours shift={shift} />
                </span>
              </div>
              <div className={styles.what}>
                <strong className={styles.role}>{shift.role}</strong>
                <span className={styles.sub}>
                  {shift.agencyName} <IdText>{shift.id}</IdText>
                </span>
              </div>
              <StatusBadge kind="shift" status={shift.status} />
            </div>
            <div className={styles.myActions}>
              {timesheet ? (
                <p className={styles.timesheetDone}>
                  <span className={styles.formLabel}>Timesheet</span>
                  <StatusBadge kind="timesheet" status={timesheet.status} />
                  <span className="nums muted">
                    {formatHours(timesheet.actualStart, timesheet.actualEnd)}
                  </span>
                </p>
              ) : shift.status === "filled" ? (
                <TimesheetEntryForm
                  shift={shift}
                  onSubmitted={onTimesheetSubmitted}
                />
              ) : null}
              {shift.status === "filled" ? (
                <ShiftCancelControl
                  shiftId={shift.id}
                  shiftLabel={shiftLabel(shift)}
                  options={NURSE_CANCEL_OPTIONS}
                  onCancelled={onCancelled}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ListPanel>
  );
}

/**
 * The nurse's one page. Desktop shows every section at once (open shifts first); phones
 * show one per bottom tab.
 */
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
  const [agency, setAgency] = useState(ALL);
  const [role, setRole] = useState(ALL);
  const agencyFilterId = useId();
  const roleFilterId = useId();

  const allShifts = shifts.data?.shifts ?? [];
  const open = allShifts
    .filter((shift) => shift.status === "open")
    .sort(byDateAndTime);
  const visibleOpen = open.filter(
    (shift) =>
      (agency === ALL || shift.agencyId === agency) &&
      (role === ALL || shift.role === role),
  );
  const agencies = [
    ...new Map(allShifts.map((shift) => [shift.agencyId, shift.agencyName])),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const roles = [...new Set(allShifts.map((shift) => shift.role))].sort();
  const mine = allShifts
    .filter((shift) => shift.status === "filled" && shift.claimedBy === user.id)
    .sort(byDateAndTime);
  const myTimesheets = timesheets.data?.timesheets ?? [];
  const lookup = createLookup({
    refs: timesheets.data?.refs,
    shifts: allShifts,
    self: { id: user.id, name: user.name },
  });

  const applyShift = (updated: Shift | CancelShiftResponse) =>
    shifts.mutate((data): ShiftListResponse => ({
      shifts: replaceShift(data.shifts, updated),
    }));
  const addTimesheet = (timesheet: Timesheet) =>
    timesheets.mutate((data): TimesheetListResponse => ({
      ...data,
      timesheets: [timesheet, ...data.timesheets],
    }));
  const addCredential = (credential: Credential) =>
    credentials.mutate((data) => ({
      credentials: [credential, ...data.credentials],
    }));

  const license = credentials.data
    ? currentCredential(credentials.data.credentials)
    : undefined;
  const finding = shifts.loading
    ? null
    : `${open.length} open ${open.length === 1 ? "shift" : "shifts"} across ${
        new Set(open.map((shift) => shift.agencyId)).size
      } ${new Set(open.map((shift) => shift.agencyId)).size === 1 ? "agency" : "agencies"}`;

  const filters = (
    <div className={styles.filters}>
      <label htmlFor={agencyFilterId} className="visually-hidden">
        Agency
      </label>
      <Select
        id={agencyFilterId}
        size="sm"
        value={agency}
        onChange={(event) => setAgency(event.target.value)}
      >
        <option value={ALL}>Agency: All</option>
        {agencies.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
      <label htmlFor={roleFilterId} className="visually-hidden">
        Role
      </label>
      <Select
        id={roleFilterId}
        size="sm"
        value={role}
        onChange={(event) => setRole(event.target.value)}
      >
        <option value={ALL}>Role: All</option>
        {roles.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <PageStack>
      <PageHeader
        title="Shifts"
        meta={
          finding ? (
            <>
              <span>{finding}</span>
              {license?.status === "expired" ? (
                <span className={styles.metaAlert}>
                  · Your license has expired
                </span>
              ) : null}
            </>
          ) : null
        }
      />

      <Panel id="open-shifts">
        <Section
          id="open-shifts"
          title="Open shifts"
          count={shifts.loading ? undefined : visibleOpen.length}
          actions={filters}
        >
          {shifts.error ? (
            <LoadError message={shifts.error} onRetry={shifts.reload} />
          ) : null}
          {shifts.loading ? (
            <ListSkeleton label="open shifts" rows={2} />
          ) : visibleOpen.length === 0 ? (
            <EmptyState>
              {open.length === 0
                ? "No open shifts right now. New postings show up here."
                : "No open shifts match these filters."}
            </EmptyState>
          ) : (
            <OpenShiftList
              shifts={visibleOpen}
              onClaimed={applyShift}
              onRefresh={shifts.reload}
            />
          )}
        </Section>
      </Panel>

      <Panel id="my-shifts">
        <Section
          id="my-shifts"
          title="My shifts"
          count={shifts.loading ? undefined : mine.length}
        >
          {shifts.loading ? (
            <ListSkeleton label="your shifts" rows={1} />
          ) : mine.length === 0 ? (
            <EmptyState>
              You haven’t claimed any shifts yet. Claimed shifts show up here.
            </EmptyState>
          ) : (
            <MyShiftList
              shifts={mine}
              timesheets={myTimesheets}
              onCancelled={applyShift}
              onTimesheetSubmitted={addTimesheet}
            />
          )}
        </Section>
      </Panel>

      <Panel id="license">
        <Section id="license" title="License" variant="card">
          {credentials.error ? (
            <LoadError
              message={credentials.error}
              onRetry={credentials.reload}
            />
          ) : null}
          {credentials.loading ? (
            <BlockSkeleton label="your license" lines={4} />
          ) : (
            <CredentialsPanel
              credentials={credentials.data?.credentials ?? []}
              onUploaded={addCredential}
            />
          )}
        </Section>
      </Panel>

      <Panel id="timesheets">
        <Section
          id="timesheets"
          title="Timesheets"
          count={timesheets.loading ? undefined : myTimesheets.length}
        >
          {timesheets.error ? (
            <LoadError message={timesheets.error} onRetry={timesheets.reload} />
          ) : null}
          {timesheets.loading ? (
            <TableSkeleton label="timesheets" rows={2} columns={5} />
          ) : (
            <TimesheetTable
              timesheets={myTimesheets}
              lookup={lookup}
              showNurse={false}
            />
          )}
        </Section>
      </Panel>
    </PageStack>
  );
}
