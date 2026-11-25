"use client";

import { TEST_IDS, type Timesheet } from "@repo/shared";
import {
  formatDateTime,
  formatMinutes,
  formatShiftDate,
  formatTimeRange,
} from "../lib/format";
import { Badge, TableScroll, VisuallyHidden } from "./ui";

/**
 * The timesheets view, shared by every role. Nurses see their own (no nurse column),
 * agencies get an Approve button on submitted rows, admins see everything.
 */
export function TimesheetTable({
  timesheets,
  showNurse = true,
  showAgency = false,
  onApprove,
  approvingId,
}: {
  timesheets: Timesheet[];
  showNurse?: boolean;
  showAgency?: boolean;
  onApprove?: (timesheet: Timesheet) => void;
  approvingId?: string | null;
}) {
  return (
    <TableScroll label="Timesheets table">
      <table className="data-table" data-testid={TEST_IDS.timesheetTable}>
        <thead>
          <tr>
            <th scope="col">Shift</th>
            <th scope="col">Date</th>
            {showNurse ? <th scope="col">Nurse</th> : null}
            {showAgency ? <th scope="col">Agency</th> : null}
            <th scope="col">Actual hours</th>
            <th scope="col">Worked</th>
            <th scope="col">Status</th>
            <th scope="col">Submitted</th>
            {onApprove ? (
              <th scope="col">
                <VisuallyHidden>Actions</VisuallyHidden>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {timesheets.length === 0 ? (
            <tr>
              <td className="empty-row" colSpan={9}>
                No timesheets yet.
              </td>
            </tr>
          ) : (
            timesheets.map((timesheet) => (
              <tr key={timesheet.id}>
                <td className="mono">{timesheet.shiftId}</td>
                <td className="nowrap">{formatShiftDate(timesheet.date)}</td>
                {showNurse ? (
                  <td className="mono">{timesheet.nurseId}</td>
                ) : null}
                {showAgency ? (
                  <td className="mono">{timesheet.agencyId}</td>
                ) : null}
                <td className="nums">
                  {formatTimeRange(timesheet.actualStart, timesheet.actualEnd)}
                </td>
                <td className="nums">
                  {formatMinutes(timesheet.minutesWorked)}
                </td>
                <td>
                  <Badge
                    tone={
                      timesheet.status === "approved" ? "success" : "warning"
                    }
                  >
                    {timesheet.status}
                  </Badge>
                </td>
                <td className="nums">
                  {formatDateTime(timesheet.submittedAt)}
                  {timesheet.approvedAt ? (
                    <span className="cell-note">
                      Approved {formatDateTime(timesheet.approvedAt)}
                      {timesheet.approvedBy
                        ? ` by ${timesheet.approvedBy}`
                        : ""}
                    </span>
                  ) : null}
                </td>
                {onApprove ? (
                  <td className="cell-actions">
                    {timesheet.status === "submitted" ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        aria-label={`Approve timesheet for ${timesheet.shiftId}`}
                        aria-disabled={
                          approvingId === timesheet.id || undefined
                        }
                        onClick={() => onApprove(timesheet)}
                      >
                        {approvingId === timesheet.id
                          ? "Approving…"
                          : "Approve"}
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableScroll>
  );
}
