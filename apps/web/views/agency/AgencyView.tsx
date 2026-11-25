"use client";

import {
  SUCCESS_MESSAGES,
  TEST_IDS,
  type Shift,
  type Timesheet,
} from "@repo/shared";
import { useCallback, useId, useState } from "react";
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
import { ApiError } from "../../lib/api";
import { useApi, useCurrentUser } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import { useResource } from "../../lib/use-resource";
import { PostShiftForm } from "./PostShiftForm";

/** Shown if an agency login has no agency (it shouldn't happen with the seed). */
const NO_AGENCY_MESSAGE = "This account isn’t linked to an agency.";

function AgencyShiftTable({
  shifts,
  onChanged,
}: {
  shifts: Shift[];
  onChanged: () => void;
}) {
  return (
    <TableScroll label="Your shifts table">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Shift</th>
            <th scope="col">When</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Nurse</th>
            <th scope="col">
              <VisuallyHidden>Actions</VisuallyHidden>
            </th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => (
            <tr key={shift.id}>
              <td className="mono">{shift.id}</td>
              <td>
                <ShiftWhen shift={shift} />
              </td>
              <td>{shift.role}</td>
              <td>
                <Badge tone={shiftStatusTone(shift.status)}>
                  {shift.status}
                </Badge>
              </td>
              <td className="mono">
                {shift.claimedBy ?? <span className="muted">—</span>}
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
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function AgencyView() {
  const user = useCurrentUser();
  const api = useApi();
  const agencyId = user.agencyId;
  const { run, pending } = useAction();
  const [formOpen, setFormOpen] = useState(false);
  const formId = useId();

  const shifts = useResource(
    useCallback(() => {
      if (!agencyId)
        return Promise.reject(new ApiError(403, NO_AGENCY_MESSAGE));
      return api.listAgencyShifts(agencyId);
    }, [api, agencyId]),
  );
  const timesheets = useResource(
    useCallback(() => api.listTimesheets(), [api]),
  );

  const ownShifts = [...(shifts.data?.shifts ?? [])].sort(byDateAndTime);
  const ownTimesheets = timesheets.data?.timesheets ?? [];
  const openCount = ownShifts.filter((shift) => shift.status === "open").length;
  const filledCount = ownShifts.filter(
    (shift) => shift.status === "filled",
  ).length;
  const awaitingCount = ownTimesheets.filter(
    (entry) => entry.status === "submitted",
  ).length;

  function openForm() {
    if (formOpen) {
      // Already open: bring it back into view and focus its first field.
      const form = document.getElementById(formId);
      form?.scrollIntoView({ block: "nearest" });
      form?.querySelector<HTMLElement>("select, input")?.focus();
      return;
    }
    setFormOpen(true);
  }

  async function approve(timesheet: Timesheet) {
    if (pending) return;
    const done = await run(
      `approve:${timesheet.id}`,
      () => api.approveTimesheet(timesheet.id),
      SUCCESS_MESSAGES.timesheetApproved,
    );
    if (done) timesheets.reload();
  }

  const approvingId = pending?.startsWith("approve:")
    ? pending.slice("approve:".length)
    : null;

  return (
    <>
      <PageHeader
        title={user.name}
        description="Post open shifts, track who’s covering them and approve timesheets."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            data-testid={TEST_IDS.agencyPostShiftButton}
            aria-expanded={formOpen}
            aria-controls={formOpen ? formId : undefined}
            onClick={openForm}
          >
            Post a shift
          </button>
        }
      />

      {formOpen ? (
        <PostShiftForm
          id={formId}
          onPosted={shifts.reload}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <dl className="stats" aria-label="Summary">
        <div className="stat">
          <dt>Open</dt>
          <dd>{openCount}</dd>
        </div>
        <div className="stat">
          <dt>Filled</dt>
          <dd>{filledCount}</dd>
        </div>
        <div className="stat">
          <dt>Timesheets to approve</dt>
          <dd>{awaitingCount}</dd>
        </div>
      </dl>

      <Section
        title="Your shifts"
        description="Report a no-show or cancel a claim. Cancelling reopens the shift for other nurses."
      >
        <SectionState
          loading={shifts.loading}
          error={shifts.error}
          empty={ownShifts.length === 0}
          emptyText="No shifts posted yet. Use “Post a shift” to add one."
        >
          <AgencyShiftTable shifts={ownShifts} onChanged={shifts.reload} />
        </SectionState>
      </Section>

      <Section
        title="Timesheets"
        description="Hours nurses submitted for your shifts."
      >
        <SectionState
          loading={timesheets.loading}
          error={timesheets.error}
          empty={false}
          emptyText=""
        >
          <TimesheetTable
            timesheets={ownTimesheets}
            onApprove={(timesheet) => void approve(timesheet)}
            approvingId={approvingId}
          />
        </SectionState>
      </Section>
    </>
  );
}
