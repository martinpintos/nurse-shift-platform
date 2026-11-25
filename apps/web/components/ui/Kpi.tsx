import type { ReactNode } from "react";
import type { Tone } from "./Badge";
import styles from "./Kpi.module.css";

/** A row of KPIs in one container split by 1px dividers (label, then value). */
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

/**
 * One KPI: a grey label with a status dot, the value, an optional caption. `tone` colors
 * the dot and the value with the status colors (amber needs coverage, green filled, red
 * cancellations); a zero stays in ink, since nothing needs attention.
 */
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
  const quiet = value === 0 || value === "0";
  return (
    <div className={styles.kpi} data-tone={quiet ? "neutral" : tone}>
      <dt className={styles.label}>
        {tone === "neutral" ? null : (
          <span className={styles.dot} aria-hidden="true" />
        )}
        {label}
      </dt>
      <dd className={styles.value}>{value}</dd>
      {detail ? <dd className={styles.detail}>{detail}</dd> : null}
    </div>
  );
}
