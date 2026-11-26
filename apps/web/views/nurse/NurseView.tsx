"use client";

import {
  SUCCESS_MESSAGES,
  TEST_IDS,
  hasShiftEnded,
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
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ShiftCancelControl } from "../../components/ShiftCancelControl";
import {
  ShiftHours,
  byDateAndTime,
  replaceShift,
  shiftEndNote,
  shiftLabel,
} from "../../components/ShiftSummary";
import { TimesheetTable } from "../../components/TimesheetTable";
import { Panel } from "../../components/shell/Panel";
import { useShell } from "../../components/shell/ShellContext";
import { ROLE_SECTIONS } from "../../components/shell/sections";
import { Badge, StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
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
  ListFilterSkeleton,
  ListSkeleton,
  Skeleton,
  TableSkeleton,
} from "../../components/ui/Skeleton";
import {
  formatHours,
  formatMinutes,
  formatShiftDate,
  formatTimeRange,
} from "../../lib/format";
import { createLookup } from "../../lib/lookup";
import { useNotifications } from "../../lib/notifications";
import { useApi, useCurrentUser } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import { useNow } from "../../lib/use-now";
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
  const claimInFlight = useRef(false);

  async function claim(shift: Shift) {
    if (claimInFlight.current) return;
    claimInFlight.current = true;
    try {
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
    } finally {
      claimInFlight.current = false;
    }
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
                  data-shift-id={shift.id}
                >
                  <div className={styles.what}>
                    <strong className={styles.role}>{shift.role}</strong>
                    <span className={styles.sub}>{shift.agencyName}</span>
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
                      busy={claiming}
                      aria-disabled={pending !== null || undefined}
                      data-testid={TEST_IDS.shiftClaimButton}
                      aria-label={`${claiming ? "Claiming" : "Claim"} ${shiftLabel(shift)}`}
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
      <ListGroupHeader>{formatShiftDate(day)}</ListGroupHeader>
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
  const headingId = useId();
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
    <form
      className={styles.timesheetForm}
      onSubmit={onSubmit}
      aria-labelledby={headingId}
    >
      <h3 id={headingId}>Hours worked</h3>
      <div className={styles.timeFields}>
        <Field label="Actual start">
          {({ id }) => (
            <Input
              id={id}
              type="time"
              required
              value={actualStart}
              onChange={(event) => setActualStart(event.target.value)}
            />
          )}
        </Field>
        <Field label="Actual end">
          {({ id }) => (
            <Input
              id={id}
              type="time"
              required
              value={actualEnd}
              onChange={(event) => setActualEnd(event.target.value)}
            />
          )}
        </Field>
      </div>
      <div className={styles.timesheetFooter}>
        <p className={styles.total}>
          Total worked{" "}
          <strong className="nums">
            {valid
              ? formatMinutes(timesheetMinutes(actualStart, actualEnd))
              : "Unavailable"}
          </strong>
          {valid && actualEnd < actualStart ? <span>Ends next day</span> : null}
        </p>
        <Button
          type="submit"
          busy={pending !== null}
          aria-label={`Submit timesheet for ${shiftLabel(shift)}`}
        >
          {pending ? "Submitting…" : "Submit timesheet"}
        </Button>
      </div>
    </form>
  );
}

function MyShiftList({
  shifts,
  timesheets,
  timesheetsReady,
  onCancelled,
  onTimesheetSubmitted,
}: {
  shifts: Shift[];
  timesheets: Timesheet[];
  timesheetsReady: boolean;
  onCancelled: (result: CancelShiftResponse) => void;
  onTimesheetSubmitted: (timesheet: Timesheet) => void;
}) {
  // The API refuses hours before the shift ends; this only keeps the form out of the way.
  const now = useNow();
  return (
    <ul className={styles.myList} aria-label="Your claimed shifts" role="list">
      {shifts.map((shift) => {
        const timesheet = timesheets.find(
          (entry) => entry.shiftId === shift.id,
        );
        return (
          <li key={shift.id} className={styles.myRow}>
            <div className={styles.myTop}>
              <div className={styles.myWhen}>
                <strong>{formatShiftDate(shift.date)}</strong>
                <span className={styles.sub}>
                  <ShiftHours shift={shift} />
                </span>
              </div>
              <div className={styles.what}>
                <strong className={styles.role}>{shift.role}</strong>
                <span className={styles.sub}>{shift.agencyName}</span>
              </div>
              <Badge tone="success" className={styles.claimed}>
                Claimed
              </Badge>
            </div>
            {timesheet ? (
              <p className={styles.timesheetDone}>
                <span>Timesheet</span>
                <StatusBadge kind="timesheet" status={timesheet.status} />
                <span className="nums muted">
                  {formatHours(timesheet.actualStart, timesheet.actualEnd)}
                </span>
              </p>
            ) : timesheetsReady ? (
              <>
                {hasShiftEnded(shift, now) ? (
                  <TimesheetEntryForm
                    shift={shift}
                    onSubmitted={onTimesheetSubmitted}
                  />
                ) : (
                  <p className={styles.timesheetPending}>
                    You can log hours after this shift ends.
                  </p>
                )}
                <div className={styles.cancelFooter}>
                  <ShiftCancelControl
                    shiftId={shift.id}
                    shiftLabel={shiftLabel(shift)}
                    onCancelled={onCancelled}
                  />
                </div>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The nurse's one page. Desktop shows every section at once (open shifts first); phones
 * show one per bottom tab.
 */
export function NurseView() {
  const user = useCurrentUser();
  const api = useApi();
  const activePanel = useShell()?.activePanel;
  const mobileTitle = ROLE_SECTIONS.nurse.find(
    (section) => section.id === activePanel && section.id !== "open-shifts",
  )?.label;
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
  const openAgencyCount = new Set(open.map((shift) => shift.agencyId)).size;
  const finding =
    open.length > 0
      ? `${open.length} open ${open.length === 1 ? "shift" : "shifts"} across ${openAgencyCount} ${openAgencyCount === 1 ? "agency" : "agencies"}`
      : null;

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
        title="Find shifts"
        mobileTitle={mobileTitle}
        meta={
          shifts.loading ? (
            <Skeleton width={152} height={20} />
          ) : finding || license?.status === "expired" ? (
            <>
              {finding ? <span>{finding}</span> : null}
              {license?.status === "expired" ? (
                <span className={styles.metaAlert}>
                  {finding ? "· " : ""}Your license has expired
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
          fullWidthMobileActions
          count={shifts.data ? visibleOpen.length : undefined}
          actions={
            shifts.loading ? (
              <ListFilterSkeleton />
            ) : open.length > 0 ? (
              filters
            ) : undefined
          }
        >
          {shifts.error ? (
            <LoadError message={shifts.error} onRetry={shifts.reload} />
          ) : null}
          {shifts.loading ? (
            <ListSkeleton label="open shifts" rows={2} dated />
          ) : !shifts.data ? null : visibleOpen.length === 0 ? (
            <EmptyState
              action={
                open.length > 0 ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setAgency(ALL);
                      setRole(ALL);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {open.length === 0
                ? "No open shifts right now."
                : "No shifts match these filters."}
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
          hideMobileHeading
          count={shifts.data ? mine.length : undefined}
        >
          {shifts.error ? (
            <LoadError message={shifts.error} onRetry={shifts.reload} />
          ) : null}
          {mine.length > 0 && timesheets.error ? (
            <LoadError message={timesheets.error} onRetry={timesheets.reload} />
          ) : null}
          {shifts.loading ? (
            <ListSkeleton label="your shifts" rows={1} />
          ) : !shifts.data ? null : mine.length === 0 ? (
            <EmptyState>You haven’t claimed any shifts yet.</EmptyState>
          ) : (
            <MyShiftList
              shifts={mine}
              timesheets={myTimesheets}
              timesheetsReady={Boolean(timesheets.data)}
              onCancelled={applyShift}
              onTimesheetSubmitted={addTimesheet}
            />
          )}
        </Section>
      </Panel>

      <Panel id="license">
        <Section id="license" title="License" variant="card" hideMobileHeading>
          {credentials.error ? (
            <LoadError
              message={credentials.error}
              onRetry={credentials.reload}
            />
          ) : null}
          {credentials.loading ? (
            <BlockSkeleton label="your license" lines={4} />
          ) : credentials.data ? (
            <CredentialsPanel
              credentials={credentials.data.credentials}
              onUploaded={addCredential}
            />
          ) : null}
        </Section>
      </Panel>

      <Panel id="timesheets">
        <Section
          id="timesheets"
          title="Timesheets"
          hideMobileHeading
          count={timesheets.data ? myTimesheets.length : undefined}
        >
          {timesheets.error ? (
            <LoadError message={timesheets.error} onRetry={timesheets.reload} />
          ) : null}
          {timesheets.loading ? (
            <TableSkeleton label="timesheets" rows={2} columns={5} />
          ) : timesheets.data ? (
            <TimesheetTable
              timesheets={myTimesheets}
              lookup={lookup}
              showNurse={false}
            />
          ) : null}
        </Section>
      </Panel>
    </PageStack>
  );
}
