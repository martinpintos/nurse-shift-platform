import type {
  CancelReason,
  CredentialStatus,
  ShiftStatus,
  TimesheetStatus,
} from "@repo/shared";
import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type Tone = "warning" | "success" | "danger" | "neutral" | "info";

/** A pill with a colored dot. The text says what it means; color only reinforces it. */
export function Badge({
  tone,
  children,
  testId,
  dot = true,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  testId?: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      data-tone={tone}
      data-testid={testId}
    >
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** Open needs coverage (amber), filled is covered (green), cancelled is red. */
export const SHIFT_STATUS_TONE = {
  open: "warning",
  filled: "success",
  cancelled: "danger",
} as const satisfies Record<ShiftStatus, Tone>;

export const TIMESHEET_STATUS_TONE = {
  submitted: "warning",
  approved: "success",
} as const satisfies Record<TimesheetStatus, Tone>;

export const CREDENTIAL_STATUS_TONE = {
  valid: "success",
  expired: "danger",
} as const satisfies Record<CredentialStatus, Tone>;

export const CANCEL_REASON_TONE = {
  "no-show": "danger",
  advance: "neutral",
} as const satisfies Record<CancelReason, Tone>;

type StatusProps =
  | { kind: "shift"; status: ShiftStatus }
  | { kind: "timesheet"; status: TimesheetStatus }
  | { kind: "credential"; status: CredentialStatus };

function toneOf(props: StatusProps): Tone {
  switch (props.kind) {
    case "shift":
      return SHIFT_STATUS_TONE[props.status];
    case "timesheet":
      return TIMESHEET_STATUS_TONE[props.status];
    case "credential":
      return CREDENTIAL_STATUS_TONE[props.status];
  }
}

/**
 * The status as the API spells it ("open", "filled"), capitalized by CSS only, so the text
 * content stays the raw status that scripts and tests read.
 */
export function StatusBadge({
  testId,
  ...props
}: StatusProps & { testId?: string }) {
  return (
    <Badge tone={toneOf(props)} testId={testId} className={styles.status}>
      {props.status}
    </Badge>
  );
}
