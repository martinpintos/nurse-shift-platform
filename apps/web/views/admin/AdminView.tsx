"use client";

import {
  SUCCESS_MESSAGES,
  TEST_IDS,
  type AdminShift,
  type AuditLogEntry,
  type OutboxMessage,
} from "@repo/shared";
import { useCallback } from "react";
import {
  STAFF_CANCEL_OPTIONS,
  ShiftCancelControl,
} from "../../components/ShiftCancelControl";
import {
  ShiftWhen,
  byDateAndTime,
  shiftLabel,
  shiftStatusTone,
} from "../../components/ShiftSummary";
import { TimesheetTable } from "../../components/TimesheetTable";
import {
  Badge,
  PageHeader,
  Section,
  SectionState,
  TableScroll,
  VisuallyHidden,
} from "../../components/ui";
import {
  AUDIT_ACTION_LABEL,
  CANCEL_REASON_LABEL,
  formatClockTime,
  formatDateTime,
} from "../../lib/format";
import { saveBlob } from "../../lib/download";
import { useApi } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import { POLL_INTERVAL_MS, usePolling } from "../../lib/use-polling";
import { useResource } from "../../lib/use-resource";

export const RESET_CONFIRM_MESSAGE =
  "Reset all demo data to the sample data? Shifts, claims, cancellations, timesheets and uploads made during the demo are removed.";

function CancellationHistory({ shift }: { shift: AdminShift }) {
  if (shift.cancellations.length === 0) return <span className="muted">—</span>;
  return (
    <ul className="history">
      {shift.cancellations.map((record) => (
        <li key={`${record.cancelledAt}-${record.previousNurseId}`}>
          <Badge tone={record.reason === "no-show" ? "danger" : "neutral"}>
            {CANCEL_REASON_LABEL[record.reason]}
          </Badge>
          <span className="history-text">
            <span className="mono">{record.previousNurseId}</span> released by{" "}
            <span className="mono">{record.cancelledBy}</span> (
            {record.cancelledByRole})
            <span className="cell-note">
              <time dateTime={record.cancelledAt}>
                {formatDateTime(record.cancelledAt)}
              </time>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AdminShiftTable({
  shifts,
  onChanged,
}: {
  shifts: AdminShift[];
  onChanged: () => void;
}) {
  return (
    <TableScroll label="All shifts table">
      <table
        className="data-table"
        data-testid={TEST_IDS.adminDashboardShiftTable}
      >
        <thead>
          <tr>
            <th scope="col">Shift</th>
            <th scope="col">When</th>
            <th scope="col">Status</th>
            <th scope="col">Nurse</th>
            <th scope="col">Cancellations</th>
            <th scope="col">
              <VisuallyHidden>Actions</VisuallyHidden>
            </th>
          </tr>
        </thead>
        <tbody>
          {shifts.length === 0 ? (
            <tr>
              <td className="empty-row" colSpan={6}>
                No shifts yet.
              </td>
            </tr>
          ) : (
            shifts.map((shift) => (
              <tr key={shift.id}>
                <td>
                  <span className="shift-id-line">
                    <span className="mono">{shift.id}</span>
                    <Badge tone="neutral">{shift.role}</Badge>
                  </span>
                  <span className="cell-note nowrap">{shift.agencyName}</span>
                </td>
                <td>
                  <ShiftWhen shift={shift} />
                </td>
                <td>
                  <Badge
                    tone={shiftStatusTone(shift.status)}
                    testId={TEST_IDS.adminShiftStatusBadge}
                  >
                    {shift.status}
                  </Badge>
                </td>
                <td>
                  {shift.claimedBy ? (
                    <span className="mono">{shift.claimedBy}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                  {shift.timesheetStatus ? (
                    <span className="cell-note nowrap">
                      Timesheet {shift.timesheetStatus}
                    </span>
                  ) : null}
                </td>
                <td>
                  <CancellationHistory shift={shift} />
                </td>
                <td className="cell-actions">
                  {shift.status === "filled" && shift.claimedBy ? (
                    <ShiftCancelControl
                      shiftId={shift.id}
                      shiftLabel={shiftLabel(shift)}
                      options={STAFF_CANCEL_OPTIONS}
                      onCancelled={onChanged}
                    />
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableScroll>
  );
}

function AuditDetails({ details }: { details: AuditLogEntry["details"] }) {
  const entries = Object.entries(details);
  if (entries.length === 0) return <span className="muted">—</span>;
  return (
    <span className="details">
      {entries.map(([key, value]) => (
        <span key={key} className="detail">
          <span className="muted">{key}</span> {String(value)}
        </span>
      ))}
    </span>
  );
}

function AuditLogTable({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <TableScroll label="Audit log table">
      <table className="data-table" data-testid={TEST_IDS.auditLogTable}>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Action</th>
            <th scope="col">Actor</th>
            <th scope="col">Entity</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td className="empty-row" colSpan={5}>
                No activity yet.
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr key={entry.id}>
                <td className="nums">
                  <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                </td>
                <td>{AUDIT_ACTION_LABEL[entry.action]}</td>
                <td>
                  <span className="mono">{entry.actorId}</span>
                  <span className="cell-note">{entry.actorRole}</span>
                </td>
                <td>
                  <span className="mono">{entry.entityId ?? "—"}</span>
                  <span className="cell-note">{entry.entityType}</span>
                </td>
                <td>
                  <AuditDetails details={entry.details} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableScroll>
  );
}

function OutboxList({ messages }: { messages: OutboxMessage[] }) {
  if (messages.length === 0) {
    return <p className="section-state muted">No notifications yet.</p>;
  }
  return (
    <ol className="outbox" aria-label="Notifications, newest first">
      {messages.map((message) => (
        <li key={message.id} className="outbox-item">
          <div className="outbox-head">
            <strong>{message.subject}</strong>
            <time className="muted small nums" dateTime={message.createdAt}>
              {formatDateTime(message.createdAt)}
            </time>
          </div>
          <p className="small muted">
            To <span className="mono">{message.recipientId}</span> (
            {message.recipientEmail}) ·{" "}
            <span className="mono">{message.shiftId}</span>
          </p>
          <p className="outbox-body">{message.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function AdminView() {
  const api = useApi();
  const { run, pending } = useAction();
  const shifts = useResource(useCallback(() => api.adminShifts(), [api]));
  const audit = useResource(useCallback(() => api.auditLog(), [api]));
  const outbox = useResource(useCallback(() => api.outbox(), [api]));
  const timesheets = useResource(
    useCallback(() => api.listTimesheets(), [api]),
  );

  function reloadAll() {
    shifts.reload();
    audit.reload();
    outbox.reload();
    timesheets.reload();
  }

  const { paused } = usePolling(reloadAll);

  async function reset() {
    if (pending) return;
    if (!window.confirm(RESET_CONFIRM_MESSAGE)) return;
    const done = await run(
      "reset",
      () => api.resetDemoData(),
      SUCCESS_MESSAGES.demoDataReset,
    );
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
      SUCCESS_MESSAGES.licensesExported,
    );
    // The export is in the audit log now.
    if (done) audit.reload();
  }

  const allShifts = [...(shifts.data?.shifts ?? [])].sort(byDateAndTime);
  const openCount = allShifts.filter((shift) => shift.status === "open").length;
  const filledCount = allShifts.filter(
    (shift) => shift.status === "filled",
  ).length;
  const cancellationCount = allShifts.reduce(
    (sum, shift) => sum + shift.cancellations.length,
    0,
  );
  const seconds = POLL_INTERVAL_MS / 1000;

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description={
          <span className="live">
            <span
              className="live-dot"
              data-paused={paused || undefined}
              aria-hidden="true"
            />
            {paused
              ? "Live updates paused while this tab is hidden"
              : `Live, refreshes every ${seconds} seconds`}
            {shifts.updatedAt
              ? ` · updated ${formatClockTime(shifts.updatedAt)}`
              : ""}
          </span>
        }
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              aria-disabled={pending === "export" || undefined}
              onClick={() => void exportLicenses()}
            >
              {pending === "export" ? "Exporting…" : "Export license documents"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-disabled={pending === "reset" || undefined}
              onClick={() => void reset()}
            >
              {pending === "reset" ? "Resetting…" : "Reset demo data"}
            </button>
          </>
        }
      />

      <dl className="stats" aria-label="Coverage summary">
        <div className="stat">
          <dt>Shifts</dt>
          <dd>{allShifts.length}</dd>
        </div>
        <div className="stat">
          <dt>Open</dt>
          <dd>{openCount}</dd>
        </div>
        <div className="stat">
          <dt>Filled</dt>
          <dd>{filledCount}</dd>
        </div>
        <div className="stat">
          <dt>Cancellations</dt>
          <dd>{cancellationCount}</dd>
        </div>
      </dl>

      <Section
        title="Shift coverage"
        description="Every shift across agencies, who covers it and its cancellation history."
      >
        <SectionState
          loading={shifts.loading}
          error={shifts.error}
          empty={false}
          emptyText=""
        >
          <AdminShiftTable shifts={allShifts} onChanged={reloadAll} />
        </SectionState>
      </Section>

      <div className="layout-split layout-split-wide">
        <Section
          title="Audit log"
          description="Every state change, newest first."
        >
          <SectionState
            loading={audit.loading}
            error={audit.error}
            empty={false}
            emptyText=""
          >
            <AuditLogTable entries={audit.data?.entries ?? []} />
          </SectionState>
        </Section>

        <Section
          title="Notification outbox"
          description="Claim and cancellation emails, held here instead of being sent."
        >
          <SectionState
            loading={outbox.loading}
            error={outbox.error}
            empty={false}
            emptyText=""
          >
            <OutboxList messages={outbox.data?.messages ?? []} />
          </SectionState>
        </Section>
      </div>

      <Section
        title="Timesheets"
        description="All submitted and approved hours."
      >
        <SectionState
          loading={timesheets.loading}
          error={timesheets.error}
          empty={false}
          emptyText=""
        >
          <TimesheetTable
            timesheets={timesheets.data?.timesheets ?? []}
            showAgency
          />
        </SectionState>
      </Section>
    </>
  );
}
