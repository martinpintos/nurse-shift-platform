import type { ReactNode } from "react";
import type { Tone } from "./Badge";
import styles from "./Kpi.module.css";

/** A row of KPI tiles, as a description list (label, then value). */
export function KpiGrid({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <dl className={styles.grid} aria-label={label}>
      {children}
    </dl>
  );
}

/** One KPI. `tone` colors the accent bar and value, matching the status colors. */
export function Kpi({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={styles.kpi} data-tone={tone}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
      {detail ? <dd className={styles.detail}>{detail}</dd> : null}
    </div>
  );
}
