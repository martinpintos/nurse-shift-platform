import { useId, type ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Section.module.css";

/** The page title row: title, an optional quiet meta line, and actions on the right. */
export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageTitle}>
        <h1>{title}</h1>
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

/**
 * A titled region. Title, an optional count and actions; no subheader (the redesign drops
 * the filler descriptions). `id` is the anchor the sidebar links to.
 */
export function Section({
  id,
  title,
  count,
  actions,
  variant = "plain",
  className,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  actions?: ReactNode;
  /** "card" puts the section on a white surface (side rails, compact panels). */
  variant?: "plain" | "card";
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      className={[styles.section, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
    >
      <div className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          {title}
          {count === undefined ? null : (
            <span className={styles.count}>{count}</span>
          )}
        </h2>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The page's blocks, one under another with the section gap between them. */
export function PageStack({ children }: { children: ReactNode }) {
  return <div className={styles.stack}>{children}</div>;
}

/** Nothing to show yet: a short sentence, optionally an action. */
export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <p>{children}</p>
      {action}
    </div>
  );
}

/** A load failed. Data already on screen stays; this says so and offers a retry. */
export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.loadError} role="alert">
      <p>Couldn’t load the latest data: {message}</p>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
