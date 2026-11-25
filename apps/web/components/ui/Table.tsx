import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import styles from "./Table.module.css";

/**
 * A data table. `testId` goes on the <table> itself. Below 960px each row stacks into a
 * card, with every cell labeled by its `Td label`; it is still a <table> for scripts and
 * screen readers. `stack={false}` keeps the grid and scrolls sideways instead.
 */
export function Table({
  label,
  testId,
  stack = true,
  className,
  children,
}: {
  /** Names the table for screen readers. */
  label: string;
  testId?: string;
  stack?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.scroll}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table
        className={[styles.table, stack ? styles.stack : null, className]
          .filter(Boolean)
          .join(" ")}
        data-testid={testId}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({
  align,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: "end" }) {
  return (
    <th scope="col" data-align={align} {...props}>
      {children}
    </th>
  );
}

/** A cell. `label` is shown before the value when rows stack into cards on phones. */
export function Td({
  label,
  align,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  label?: string;
  align?: "end";
}) {
  return (
    <td data-label={label} data-align={align} {...props}>
      {children}
    </td>
  );
}

/** A full-width row for "nothing here yet". */
export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr className={styles.emptyRow}>
      <td colSpan={colSpan}>{children}</td>
    </tr>
  );
}

/** A value with a quieter second line under it (an id, a note). */
export function CellStack({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <span className={styles.cellStack}>
      <span>{primary}</span>
      {secondary ? <span className={styles.secondary}>{secondary}</span> : null}
    </span>
  );
}
