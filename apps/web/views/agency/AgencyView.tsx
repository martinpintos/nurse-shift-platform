"use client";

import {
  SUCCESS_MESSAGES,
  TEST_IDS,
  type AgencyShiftListResponse,
  type CancelShiftResponse,
  type Shift,
  type Timesheet,
} from "@repo/shared";
import { useCallback, useState } from "react";
import {
  STAFF_CANCEL_OPTIONS,
  ShiftCancelControl,
} from "../../components/ShiftCancelControl";
import {
  ShiftHours,
  byDateAndTime,
  replaceShift,
  shiftLabel,
  toShift,
} from "../../components/ShiftSummary";
import { TimesheetTable } from "../../components/TimesheetTable";
import { Panel } from "../../components/shell/Panel";
import { StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PlusIcon } from "../../components/ui/icons";
import {
  EmptyState,
  LoadError,
  PageHeader,
  PageStack,
  Section,
} from "../../components/ui/Section";
import { TableSkeleton } from "../../components/ui/Skeleton";
import { CellStack, EmptyRow, Table, Td, Th } from "../../components/ui/Table";
import { Tabs, tabPanelProps } from "../../components/ui/Tabs";
import { ApiError } from "../../lib/api";
import { formatDay } from "../../lib/format";
import { createLookup, type Lookup } from "../../lib/lookup";
import { useApi, useCurrentUser } from "../../lib/session";
import { useAction } from "../../lib/use-action";
import { useResource } from "../../lib/use-resource";
import { PostShiftDrawer } from "./PostShiftForm";
import styles from "./AgencyView.module.css";

/** Shown if an agency login has no agency (it shouldn't happen with the seed). */
const NO_AGENCY_MESSAGE = "This account isn’t linked to an agency.";

type ShiftTab = "all" | "open" | "filled";

function AgencyShiftTable({
  shifts,
  lookup,
  onCancelled,
}: {
  shifts: Shift[];
  lookup: Lookup;
  onCancelled: (result: CancelShiftResponse) => void;
}) {
  return (
    <Table label="Your shifts">
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Role</Th>
          <Th>Hours</Th>
          <Th>Status</Th>
          <Th>Assigned nurse</Th>
          <Th>
            <span className="visually-hidden">Actions</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {shifts.length === 0 ? (
          <EmptyRow colSpan={6}>No shifts in this view.</EmptyRow>
        ) : (
          shifts.map((shift) => (
            <tr key={shift.id}>
              <Td label="Date">
                <CellStack
                  primary={
                    <strong className="nowrap">{formatDay(shift.date)}</strong>
                  }
                  secondary={shift.id}
                />
              </Td>
              <Td label="Role">{shift.role}</Td>
              <Td label="Hours">
                <ShiftHours shift={shift} />
              </Td>
              <Td label="Status">
                <StatusBadge kind="shift" status={shift.status} />
              </Td>
              <Td label="Assigned nurse">
                {shift.claimedBy ? (
                  lookup.name(shift.claimedBy)
                ) : (
                  <span className="muted">—</span>
                )}
              </Td>
              <Td end>
                {shift.status === "filled" && shift.claimedBy ? (
                  <ShiftCancelControl
                    shiftId={shift.id}
                    shiftLabel={shiftLabel(shift)}
                    options={STAFF_CANCEL_OPTIONS}
                    onCancelled={onCancelled}
                  />
                ) : null}
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}

/**
 * The agency's one page: its shifts (post, track, cancel) and the timesheets to approve.
 * Posting opens a drawer beside the table.
 */
export function AgencyView() {
  const user = useCurrentUser();
  const api = useApi();
  const agencyId = user.agencyId;
  const { run, pending } = useAction();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<ShiftTab>("all");

  const shifts = useResource(
    useCallback(() => {
      if (!agencyId)
        return Promise.reject(new ApiError(403, NO_AGENCY_MESSAGE));
      return api.listAgencyShifts(agencyId);
    }, [api, agencyId]),
  );
  const people = useResource(
    useCallback(() => {
      if (!agencyId) return Promise.resolve({ agencyId: "", people: {} });
      return api.agencyPeople(agencyId);
    }, [api, agencyId]),
  );
  const timesheets = useResource(
    useCallback(() => api.listTimesheets(), [api]),
  );

  const ownShifts = [...(shifts.data?.shifts ?? [])].sort(byDateAndTime);
  const ownTimesheets = timesheets.data?.timesheets ?? [];
  const lookup = createLookup({
    refs: timesheets.data?.refs,
    people: people.data?.people,
    shifts: ownShifts,
  });
  const counts = {
    all: ownShifts.length,
    open: ownShifts.filter((shift) => shift.status === "open").length,
    filled: ownShifts.filter((shift) => shift.status === "filled").length,
  };
  const visible =
    tab === "all"
      ? ownShifts
      : ownShifts.filter((shift) => shift.status === tab);
  const awaiting = ownTimesheets.filter(
    (entry) => entry.status === "submitted",
  ).length;

  function applyShift(updated: Shift) {
    shifts.mutate((data): AgencyShiftListResponse => ({
      ...data,
      shifts: data.shifts.some((shift) => shift.id === updated.id)
        ? replaceShift(data.shifts, updated)
        : [...data.shifts, toShift(updated)],
    }));
  }

  async function approve(timesheet: Timesheet) {
    if (pending) return;
    await run(
      `approve:${timesheet.id}`,
      () => api.approveTimesheet(timesheet.id),
      {
        success: SUCCESS_MESSAGES.timesheetApproved,
        apply: (approved) =>
          timesheets.mutate((data) => ({
            ...data,
            timesheets: data.timesheets.map((entry) =>
              entry.id === approved.id ? approved : entry,
            ),
          })),
      },
    );
  }

  const approvingId = pending?.startsWith("approve:")
    ? pending.slice("approve:".length)
    : null;

  const finding = shifts.loading
    ? null
    : counts.open === 0
      ? "Every shift is covered"
      : `${counts.open} ${counts.open === 1 ? "shift needs" : "shifts need"} a nurse`;

  return (
    <PageStack>
      <PageHeader
        title="Shifts"
        meta={
          finding ? (
            <>
              <span>{finding}</span>
              {awaiting > 0 ? (
                <span>
                  · {awaiting} {awaiting === 1 ? "timesheet" : "timesheets"} to
                  approve
                </span>
              ) : null}
            </>
          ) : null
        }
        actions={
          <Button
            variant="primary"
            icon={<PlusIcon size={18} />}
            data-testid={TEST_IDS.agencyPostShiftButton}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            Post shift
          </Button>
        }
      />

      <Panel id="shifts">
        <section
          id="shifts"
          className={styles.block}
          aria-label="Shifts by status"
        >
          <Tabs<ShiftTab>
            label="Filter shifts by status"
            idBase="agency-shifts"
            value={tab}
            onChange={setTab}
            items={[
              { id: "all", label: "All shifts", count: counts.all },
              { id: "open", label: "Open", count: counts.open },
              { id: "filled", label: "Filled", count: counts.filled },
            ]}
          />
          <div {...tabPanelProps("agency-shifts", tab)}>
            {shifts.error ? (
              <LoadError message={shifts.error} onRetry={shifts.reload} />
            ) : null}
            {shifts.loading ? (
              <TableSkeleton label="your shifts" rows={3} columns={6} />
            ) : ownShifts.length === 0 ? (
              <EmptyState>
                No shifts posted yet. Use Post shift to add one.
              </EmptyState>
            ) : (
              <AgencyShiftTable
                shifts={visible}
                lookup={lookup}
                onCancelled={applyShift}
              />
            )}
          </div>
        </section>
      </Panel>

      <Panel id="timesheets">
        <Section
          id="timesheets"
          title="Timesheets"
          count={timesheets.loading ? undefined : ownTimesheets.length}
        >
          {timesheets.error ? (
            <LoadError message={timesheets.error} onRetry={timesheets.reload} />
          ) : null}
          {timesheets.loading ? (
            <TableSkeleton label="timesheets" rows={2} columns={6} />
          ) : (
            <TimesheetTable
              timesheets={ownTimesheets}
              lookup={lookup}
              onApprove={(timesheet) => void approve(timesheet)}
              approvingId={approvingId}
            />
          )}
        </Section>
      </Panel>

      {drawerOpen ? (
        <PostShiftDrawer
          onPosted={applyShift}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </PageStack>
  );
}
