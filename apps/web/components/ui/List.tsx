import type { HTMLAttributes, ReactNode } from "react";
import styles from "./List.module.css";

/** A bordered list panel: one white surface, rows split by 1px rules. */
export function ListPanel({
  label,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLUListElement> & { label: string }) {
  return (
    <ul
      className={className ? `${styles.panel} ${className}` : styles.panel}
      aria-label={label}
      {...props}
    >
      {children}
    </ul>
  );
}

/** A grey band that groups the rows under it, e.g. a date: "Fri, Oct 2". */
export function ListGroupHeader({ children }: { children: ReactNode }) {
  return (
    <li className={styles.group} role="presentation">
      {children}
    </li>
  );
}

export const listStyles = styles;
