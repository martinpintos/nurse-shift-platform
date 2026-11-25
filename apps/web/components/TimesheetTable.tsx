"use client";

import { TEST_IDS, type Timesheet } from "@repo/shared";
import { formatMinutes, formatShiftDate } from "../lib/format";
import type { Lookup } from "../lib/lookup";
import { StatusBadge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { RelativeTime } from "./ui/RelativeTime";
import { CellStack, EmptyRow, Table, Td, Th } from "./ui/Table";
import { ShiftHours } from "./ShiftSummary";

/**
 * The timesheets table, shared by every role. Nurses see their own (no nurse column),
 * agencies get an Approve button on submitted rows, the admin sees every agency.
 */
export function TimesheetTable({
  timesheets,
  lookup,
  showNurse = true,
  showAgency = false,
  onApprove,
  approvingId,
}: {
  timesheets: Timesheet[];
  lookup: Lookup;
  showNurse?: boolean;
  showAgency?: boolean;
  onApprove?: (timesheet: Timesheet) => void;
  approvingId?: string | null;
}) {
  return (
    <Table label="Timesheets" testId={TEST_IDS.timesheetTable}>
      {timesheets.length > 0 ? (
        <thead>
          <tr>
            <Th>Date</Th>
            {showNurse ? <Th>Nurse</Th> : null}
            <Th>Shift</Th>
            {showAgency ? <Th>Agency</Th> : null}
            <Th>Hours</Th>
            <Th end>Worked</Th>
            <Th>Status</Th>
            {onApprove ? (
              <Th>
                <span className="visually-hidden">Actions</span>
              </Th>
            ) : null}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {timesheets.length === 0 ? (
          <EmptyRow colSpan={1}>No timesheets yet.</EmptyRow>
        ) : (
          timesheets.map((timesheet) => {
            const shift = lookup.shift(timesheet.shiftId);
            return (
              <tr key={timesheet.id}>
                <Td label="Date">
                  <CellStack
                    primary={<span>{formatShiftDate(timesheet.date)}</span>}
                    secondary={showNurse ? timesheet.shiftId : undefined}
                  />
                </Td>
                {showNurse ? (
                  <Td label="Nurse">{lookup.name(timesheet.nurseId)}</Td>
                ) : null}
                <Td label="Shift">
                  {shift
                    ? showAgency
                      ? shift.role
                      : `${shift.role} · ${shift.agencyName}`
                    : showNurse
                      ? timesheet.shiftId
                      : "Shift details unavailable"}
                </Td>
                {showAgency ? (
                  <Td label="Agency">
                    {shift?.agencyName ?? timesheet.agencyId}
                  </Td>
                ) : null}
                <Td label="Hours">
                  <ShiftHours
                    shift={{
                      startTime: timesheet.actualStart,
                      endTime: timesheet.actualEnd,
                    }}
                  />
                </Td>
                <Td label="Worked" end className="nums nowrap">
                  {formatMinutes(timesheet.minutesWorked)}
                </Td>
                <Td label="Status">
                  <span className="nowrap">
                    <StatusBadge kind="timesheet" status={timesheet.status} />{" "}
                    <span className="muted small">
                      <RelativeTime
                        dateTime={timesheet.approvedAt ?? timesheet.submittedAt}
                      />
                    </span>
                  </span>
                </Td>
                {onApprove ? (
                  <Td>
                    {timesheet.status === "submitted" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        busy={approvingId === timesheet.id}
                        aria-label={`Approve timesheet for ${timesheet.shiftId}`}
                        onClick={() => onApprove(timesheet)}
                      >
                        {approvingId === timesheet.id
                          ? "Approving…"
                          : "Approve"}
                      </Button>
                    ) : null}
                  </Td>
                ) : null}
              </tr>
            );
          })
        )}
      </tbody>
    </Table>
  );
}
