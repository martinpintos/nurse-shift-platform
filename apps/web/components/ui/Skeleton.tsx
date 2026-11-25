import type { CSSProperties, ReactNode } from "react";
import styles from "./Skeleton.module.css";

/** A shimmering placeholder block. Decorative: wrap groups in `SkeletonGroup`. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius,
  className,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
}) {
  return (
    <span
      className={
        className ? `${styles.skeleton} ${className}` : styles.skeleton
      }
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** Announces "Loading <label>" once for the placeholders inside it. */
export function SkeletonGroup({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} role="status" aria-busy="true">
      <span className="visually-hidden">Loading {label}</span>
      {children}
    </div>
  );
}

const WIDTHS = ["72%", "54%", "64%", "46%", "58%"];

/** Rows shaped like a table's, header included. */
export function TableSkeleton({
  label,
  rows = 3,
  columns = 5,
}: {
  label: string;
  rows?: number;
  columns?: number;
}) {
  return (
    <SkeletonGroup label={label} className={styles.table}>
      <div className={styles.tableHead}>
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton key={column} width="48%" height={12} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className={styles.tableRow}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              width={WIDTHS[(row + column) % WIDTHS.length]}
              height={14}
            />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Rows shaped like a list of cards: two lines and an action. */
export function ListSkeleton({
  label,
  rows = 3,
  action = true,
}: {
  label: string;
  rows?: number;
  action?: boolean;
}) {
  return (
    <SkeletonGroup label={label} className={styles.list}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className={styles.listRow}>
          <div className={styles.listText}>
            <Skeleton width={WIDTHS[row % WIDTHS.length]} height={16} />
            <Skeleton width="38%" height={12} />
          </div>
          {action ? <Skeleton width={112} height={36} radius={8} /> : null}
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Placeholder KPI tiles. */
export function KpiSkeleton({ count = 5 }: { count?: number }) {
  return (
    <SkeletonGroup label="summary" className={styles.kpis}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.kpi}>
          <Skeleton width="60%" height={12} />
          <Skeleton width={56} height={28} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A compact block, e.g. for a card's body. */
export function BlockSkeleton({
  label,
  lines = 3,
}: {
  label: string;
  lines?: number;
}) {
  return (
    <SkeletonGroup label={label} className={styles.block}>
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton key={line} width={WIDTHS[line % WIDTHS.length]} height={14} />
      ))}
    </SkeletonGroup>
  );
}
