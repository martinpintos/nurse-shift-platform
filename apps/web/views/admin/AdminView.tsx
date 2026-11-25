"use client";

import {
  SUCCESS_MESSAGES,
  TEST_IDS,
  type AdminShift,
  type AdminShiftListResponse,
  type AuditLogEntry,
  type CancelShiftResponse,
  type OutboxMessage,
} from "@repo/shared";
import { useCallback, useId, useState } from "react";
import { ShiftCancelControl } from "../../components/ShiftCancelControl";
import {
  ShiftHours,
  byDateAndTime,
  replaceShift,
  shiftLabel,
} from "../../components/ShiftSummary";
import { TimesheetTable } from "../../components/TimesheetTable";
import { Panel } from "../../components/shell/Panel";
import { StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Field";
import { DownloadIcon, ResetIcon } from "../../components/ui/icons";
import { Kpi, KpiGrid } from "../../components/ui/Kpi";
import { ListPanel } from "../../components/ui/List";
import { RelativeTime } from "../../components/ui/RelativeTime";
import {
  EmptyState,
  LoadError,
  PageHeader,
  PageStack,
  Section,
} from "../../components/ui/Section";
import {
  KpiSkeleton,
  ListSkeleton,
  TableSkeleton,
} from "../../components/ui/Skeleton";
import { CellStack, EmptyRow, Table, Td, Th } from "../../components/ui/Table";
import { Tabs, tabPanelProps } from "../../components/ui/Tabs";
import { describeActivity } from "../../lib/activity";
import { ApiError } from "../../lib/api";
import { saveBlob } from "../../lib/download";
import { formatDateTime, formatShiftDate } from "../../lib/format";
import { createLookup, type Lookup } from "../../lib/lookup";
import { useApi } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import { useNow } from "../../lib/use-now";
import { POLL_INTERVAL_MS, usePolling } from "../../lib/use-polling";
import { useResource } from "../../lib/use-resource";
import styles from "./AdminView.module.css";

export const RESET_CONFIRM_MESSAGE =
  "Shifts, claims, cancellations, timesheets and uploads made during the demo are removed, and the sample data comes back.";

type CoverageTab = "open" | "filled" | "all";

const ALL_AGENCIES = "all";

/** Rows of recent activity shown before "Show all". */
const RECENT_ACTIVITY = 8;
/** Outbox messages shown before "Show all". */
const RECENT_MESSAGES = 4;

function retryAdminRead(error: unknown): boolean {
  return (
    error instanceof ApiError && [0, 500, 502, 503, 504].includes(error.status)
  );
}

/** "1 no-show", "2 cancelled", or both: the shift's cancellation history in brief. */
function historyNote(shift: AdminShift): string | null {
  const noShows = shift.cancellations.filter(
    (record) => record.reason === "no-show",
  ).length;
  const advance = shift.cancellations.length - noShows;
  const parts = [
    noShows > 0 ? `${noShows} no-show${noShows === 1 ? "" : "s"}` : null,
    advance > 0 ? `${advance} cancelled` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function CoverageTable({
  shifts,
  lookup,
  onCancelled,
}: {
  shifts: AdminShift[];
  lookup: Lookup;
  onCancelled: (result: CancelShiftResponse) => void;
}) {
  return (
    <Table label="Shift coverage" testId={TEST_IDS.adminDashboardShiftTable}>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Role</Th>
          <Th>Agency</Th>
          <Th>Hours</Th>
          <Th>Assigned nurse</Th>
          <Th>Status</Th>
          <Th>
            <span className="visually-hidden">Actions</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {shifts.length === 0 ? (
          <EmptyRow colSpan={7}>No shifts in this view.</EmptyRow>
        ) : (
          shifts.map((shift) => {
            const history = historyNote(shift);
            return (
              <tr key={shift.id}>
                <Td label="Date">
                  <CellStack
                    primary={<strong>{formatShiftDate(shift.date)}</strong>}
                    secondary={shift.id}
                  />
                </Td>
                <Td label="Role">{shift.role}</Td>
                <Td label="Agency">{shift.agencyName}</Td>
                <Td label="Hours">
                  <ShiftHours shift={shift} />
                </Td>
                <Td label="Assigned nurse">
                  {shift.claimedBy ? (
                    <CellStack
                      primary={lookup.name(shift.claimedBy)}
                      secondary={
                        shift.timesheetStatus
                          ? `Timesheet ${shift.timesheetStatus}`
                          : undefined
                      }
                    />
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </Td>
                <Td label="Status">
                  <span className={styles.status}>
                    <StatusBadge
                      kind="shift"
                      status={shift.status}
                      testId={TEST_IDS.adminShiftStatusBadge}
                    />
                    {history ? (
                      <span className={styles.history}>{history}</span>
                    ) : null}
                  </span>
                </Td>
                <Td end>
                  {shift.status === "filled" &&
                  shift.claimedBy &&
                  !shift.timesheetStatus ? (
                    <ShiftCancelControl
                      shiftId={shift.id}
                      shiftLabel={shiftLabel(shift)}
                      staff
                      onCancelled={onCancelled}
                    />
                  ) : null}
                </Td>
              </tr>
            );
          })
        )}
      </tbody>
    </Table>
  );
}

function ActivityTable({
  entries,
  lookup,
}: {
  entries: AuditLogEntry[];
  lookup: Lookup;
}) {
  return (
    <Table label="Recent activity" testId={TEST_IDS.auditLogTable}>
      <thead>
        <tr>
          <Th>Activity</Th>
          <Th>What happened</Th>
          <Th end>When</Th>
        </tr>
      </thead>
      <tbody>
        {entries.length === 0 ? (
          <EmptyRow colSpan={3}>No activity yet.</EmptyRow>
        ) : (
          entries.map((entry) => {
            const line = describeActivity(entry, lookup);
            return (
              <tr key={entry.id}>
                <Td label="Activity">
                  <strong className="nowrap">{line.title}</strong>
                </Td>
                <Td>
                  <span className={styles.activitySentence}>
                    {line.sentence.map((part, index) =>
                      typeof part === "string" ? (
                        part
                      ) : (
                        <strong key={index}>{part.emphasis}</strong>
                      ),
                    )}
                  </span>
                </Td>
                <Td label="When" end className="muted nowrap">
                  <RelativeTime dateTime={entry.at} />
                </Td>
              </tr>
            );
          })
        )}
      </tbody>
    </Table>
  );
}

/** Makes the demo's generated subjects easier to scan, including stored messages. */
function outboxTitle({ subject, shiftId }: OutboxMessage): string {
  switch (subject) {
    case `You claimed shift ${shiftId}`:
      return "You claimed a shift";
    case `Shift ${shiftId} was claimed`:
      return "Shift claimed";
    case `Your claim on shift ${shiftId} was cancelled`:
      return "Your shift claim was cancelled";
    case `Shift ${shiftId} is open again`:
      return "Shift reopened";
    default:
      return subject;
  }
}

function OutboxList({
  messages,
  lookup,
}: {
  messages: OutboxMessage[];
  lookup: Lookup;
}) {
  return (
    <ListPanel label="Notifications, newest first">
      {messages.map((message) => {
        const subject = outboxTitle(message);
        return (
          <li key={message.id} className={styles.message}>
            <div className={styles.messageHead}>
              <strong>
                {subject}
                {!subject.includes(message.shiftId) ? (
                  <>
                    {" "}
                    <span className={styles.messageReference}>
                      ({message.shiftId})
                    </span>
                  </>
                ) : null}
              </strong>
              <RelativeTime
                dateTime={message.createdAt}
                className={styles.messageTime}
              />
            </div>
            <p className={styles.messageTo}>
              <span>
                To
                {lookup.knows(message.recipientId) ? (
                  <>
                    {" "}
                    <strong>{lookup.name(message.recipientId)}</strong>
                  </>
                ) : null}
              </span>{" "}
              <span className={styles.messageEmail}>
                {message.recipientEmail}
              </span>
            </p>
            <p className={styles.messageBody}>{message.body}</p>
          </li>
        );
      })}
    </ListPanel>
  );
}

/**
 * The admin's dashboard: coverage KPIs and every shift, recent activity, the outbox and
 * timesheets, live. Reset demo data is the one action that asks first, in an in-app dialog.
 */
export function AdminView() {
  const api = useApi();
  const { run, pending } = useAction();
  const shifts = useResource(
    useCallback(() => api.adminShifts(), [api]),
    retryAdminRead,
  );
  const audit = useResource(
    useCallback(() => api.auditLog(), [api]),
    retryAdminRead,
  );
  const outbox = useResource(
    useCallback(() => api.outbox(), [api]),
    retryAdminRead,
  );
  const timesheets = useResource(
    useCallback(() => api.listTimesheets(), [api]),
    retryAdminRead,
  );
  const [tab, setTab] = useState<CoverageTab>("all");
  const [agency, setAgency] = useState(ALL_AGENCIES);
  const [confirmReset, setConfirmReset] = useState(false);
  const [allActivity, setAllActivity] = useState(false);
  const [allMessages, setAllMessages] = useState(false);
  const agencySelectId = useId();

  function reloadAll() {
    shifts.reload();
    audit.reload();
    outbox.reload();
    timesheets.reload();
  }

  const { paused } = usePolling(reloadAll);
  const now = useNow(POLL_INTERVAL_MS);
  const feeds = [shifts, audit, outbox, timesheets];
  const delayed = feeds.some(
    ({ error, updatedAt }) =>
      error ||
      (updatedAt &&
        now.getTime() - updatedAt.getTime() >= POLL_INTERVAL_MS * 3),
  );
  const status = paused
    ? "Updates paused"
    : delayed
      ? "Updates delayed"
      : feeds.some(({ loading }) => loading)
        ? "Connecting…"
        : "Live";
  const lastCoverageRefresh = shifts.updatedAt?.toISOString();

  async function reset() {
    if (pending) return;
    const done = await run("reset", () => api.resetDemoData(), {
      success: SUCCESS_MESSAGES.demoDataReset,
    });
    setConfirmReset(false);
    if (done) reloadAll();
  }

  async function exportLicenses() {
    if (pending) return;
    const done = await run(
      "export",
      async () => {
        const { blob, fileName } = await api.exportLicenses();
        saveBlob(blob, fileName);
      },
      { success: SUCCESS_MESSAGES.licensesExported },
    );
    // The export is in the audit log now.
    if (done) audit.reload();
  }

  function applyCancel(result: CancelShiftResponse) {
    shifts.mutate((data): AdminShiftListResponse => ({
      ...data,
      shifts: replaceShift(data.shifts, result, (previous, next) => ({
        ...previous,
        ...next,
        timesheetStatus: null,
      })),
    }));
    // The cancellation's history and audit entry come with the next poll; ask now.
    audit.reload();
    outbox.reload();
  }

  const allShifts = [...(shifts.data?.shifts ?? [])].sort(byDateAndTime);
  const agencies = [
    ...new Map(allShifts.map((shift) => [shift.agencyId, shift.agencyName])),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  // Counts follow the agency filter, so the tabs and KPIs describe what is shown.
  const scoped =
    agency === ALL_AGENCIES
      ? allShifts
      : allShifts.filter((shift) => shift.agencyId === agency);
  const openShifts = scoped.filter((shift) => shift.status === "open");
  const filledShifts = scoped.filter((shift) => shift.status === "filled");
  const visible =
    tab === "open" ? openShifts : tab === "filled" ? filledShifts : scoped;
  const cancellations = scoped.flatMap((shift) => shift.cancellations);
  const noShows = cancellations.filter(
    (record) => record.reason === "no-show",
  ).length;
  const covered = openShifts.length + filledShifts.length;
  const coverage =
    covered === 0 ? null : Math.round((filledShifts.length / covered) * 100);
  const allTimesheets = timesheets.data?.timesheets ?? [];
  const pendingTimesheets = allTimesheets.filter(
    (entry) => entry.status === "submitted",
  ).length;

  const lookup = createLookup({
    refs: {
      people: {
        ...timesheets.data?.refs.people,
        ...outbox.data?.refs.people,
        ...audit.data?.refs.people,
        ...shifts.data?.refs.people,
      },
      shifts: {
        ...timesheets.data?.refs.shifts,
        ...outbox.data?.refs.shifts,
        ...audit.data?.refs.shifts,
        ...shifts.data?.refs.shifts,
      },
    },
    shifts: allShifts,
  });

  const entries = audit.data?.entries ?? [];
  const shownEntries = allActivity
    ? entries
    : entries.slice(0, RECENT_ACTIVITY);
  const messages = outbox.data?.messages ?? [];
  const shownMessages = allMessages
    ? messages
    : messages.slice(0, RECENT_MESSAGES);

  return (
    <PageStack>
      <PageHeader
        title="Shift coverage"
        titleStatus={
          <span className={styles.live} role="status" data-state={status}>
            <span className={styles.liveDot} aria-hidden="true" />
            {status}
          </span>
        }
        meta={
          status === "Updates delayed" && lastCoverageRefresh ? (
            <span>
              Coverage last updated{" "}
              <time dateTime={lastCoverageRefresh}>
                {formatDateTime(lastCoverageRefresh)}
              </time>
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<DownloadIcon size={18} />}
              busy={pending === "export"}
              aria-label="Export license documents"
              onClick={() => void exportLicenses()}
            >
              {pending === "export" ? (
                "Exporting…"
              ) : (
                <span>
                  Export<span className={styles.long}> license documents</span>
                </span>
              )}
            </Button>
            <Button
              variant="secondary"
              icon={<ResetIcon size={18} />}
              aria-label="Reset demo data"
              onClick={() => setConfirmReset(true)}
            >
              <span>
                Reset<span className={styles.long}> demo data</span>
              </span>
            </Button>
          </>
        }
      />

      <Panel id="coverage">
        <div className={styles.coverage}>
          {shifts.loading ? (
            <KpiSkeleton count={5} />
          ) : shifts.data ? (
            <KpiGrid label="Coverage summary">
              <Kpi
                label="Needs coverage"
                value={openShifts.length}
                tone="warning"
              />
              <Kpi label="Filled" value={filledShifts.length} tone="success" />
              <Kpi
                label="Coverage rate"
                value={coverage === null ? "N/A" : `${coverage}%`}
                detail={
                  covered > 0
                    ? `${filledShifts.length} of ${covered} shifts filled`
                    : undefined
                }
              />
              <Kpi
                label="Cancellations"
                value={cancellations.length}
                tone="danger"
                detail={
                  noShows > 0
                    ? `${noShows} ${noShows === 1 ? "no-show" : "no-shows"}`
                    : undefined
                }
              />
              <Kpi
                label="Timesheets pending"
                value={timesheets.data ? pendingTimesheets : "N/A"}
                tone={pendingTimesheets > 0 ? "warning" : "neutral"}
              />
            </KpiGrid>
          ) : null}

          <section
            id="coverage"
            className={styles.block}
            aria-label="Coverage by status"
          >
            <div className={styles.toolbar}>
              <Tabs<CoverageTab>
                label="Filter shifts by coverage"
                idBase="admin-coverage"
                value={tab}
                onChange={setTab}
                items={[
                  {
                    id: "open",
                    label: "Needs coverage",
                    count: shifts.data ? openShifts.length : undefined,
                  },
                  {
                    id: "filled",
                    label: "Filled",
                    count: shifts.data ? filledShifts.length : undefined,
                  },
                  {
                    id: "all",
                    label: "All shifts",
                    count: shifts.data ? scoped.length : undefined,
                  },
                ]}
              />
              <label htmlFor={agencySelectId} className="visually-hidden">
                Agency
              </label>
              <Select
                id={agencySelectId}
                className={styles.agency}
                value={agency}
                onChange={(event) => setAgency(event.target.value)}
              >
                <option value={ALL_AGENCIES}>All agencies</option>
                {agencies.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div {...tabPanelProps("admin-coverage", tab)}>
              {shifts.error ? (
                <LoadError message={shifts.error} onRetry={shifts.reload} />
              ) : null}
              {shifts.loading ? (
                <TableSkeleton label="shifts" rows={3} columns={7} />
              ) : shifts.data ? (
                <CoverageTable
                  shifts={visible}
                  lookup={lookup}
                  onCancelled={applyCancel}
                />
              ) : null}
            </div>
          </section>
        </div>
      </Panel>

      <Panel id="activity">
        <Section
          id="activity"
          title="Recent activity"
          actions={
            entries.length > RECENT_ACTIVITY ? (
              <Button
                variant="quiet"
                size="sm"
                aria-expanded={allActivity}
                onClick={() => setAllActivity((value) => !value)}
              >
                {allActivity ? "Show recent" : `Show all ${entries.length}`}
              </Button>
            ) : null
          }
        >
          {audit.error ? (
            <LoadError message={audit.error} onRetry={audit.reload} />
          ) : null}
          {audit.loading ? (
            <TableSkeleton label="recent activity" rows={3} columns={3} />
          ) : audit.data ? (
            <ActivityTable entries={shownEntries} lookup={lookup} />
          ) : null}
        </Section>

        <Section
          id="outbox"
          title="Demo email outbox"
          count={outbox.data ? messages.length : undefined}
          actions={
            messages.length > RECENT_MESSAGES ? (
              <Button
                variant="quiet"
                size="sm"
                aria-expanded={allMessages}
                onClick={() => setAllMessages((value) => !value)}
              >
                {allMessages ? "Show recent" : `Show all ${messages.length}`}
              </Button>
            ) : null
          }
        >
          {outbox.error ? (
            <LoadError message={outbox.error} onRetry={outbox.reload} />
          ) : null}
          {outbox.loading ? (
            <ListSkeleton label="notifications" rows={2} action={false} />
          ) : !outbox.data ? null : messages.length === 0 ? (
            <EmptyState>
              No demo emails yet. Claim and cancellation messages are recorded
              here.
            </EmptyState>
          ) : (
            <OutboxList messages={shownMessages} lookup={lookup} />
          )}
        </Section>
      </Panel>

      <Panel id="timesheets">
        <Section
          id="timesheets"
          title="Timesheets"
          count={timesheets.data ? allTimesheets.length : undefined}
        >
          {timesheets.error ? (
            <LoadError message={timesheets.error} onRetry={timesheets.reload} />
          ) : null}
          {timesheets.loading ? (
            <TableSkeleton label="timesheets" rows={2} columns={7} />
          ) : timesheets.data ? (
            <TimesheetTable
              timesheets={allTimesheets}
              lookup={lookup}
              showAgency
            />
          ) : null}
        </Section>
      </Panel>

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        confirmLabel={pending === "reset" ? "Resetting…" : "Reset demo data"}
        busy={pending === "reset"}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      >
        {RESET_CONFIRM_MESSAGE}
      </ConfirmDialog>
    </PageStack>
  );
}
