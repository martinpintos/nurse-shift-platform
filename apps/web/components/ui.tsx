import { useId, type ReactNode } from "react";

/** A status pill. `tone` picks the color; the text is the status itself. */
export function Badge({
  tone,
  children,
  testId,
}: {
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span className="badge" data-tone={tone} data-testid={testId}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

/** A titled card. The heading labels the region for screen readers. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      className={className ? `card ${className}` : "card"}
      aria-labelledby={headingId}
    >
      <div className="section-header">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? (
            <p className="section-description">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Empty, loading and load-error states inside a section. */
export function SectionState({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  if (loading) return <p className="section-state muted">Loading…</p>;
  return (
    <>
      {error ? (
        <p className="section-state load-error" role="alert">
          Couldn’t load the latest data: {error}
        </p>
      ) : null}
      {empty ? <p className="section-state muted">{emptyText}</p> : children}
    </>
  );
}

/** Horizontally scrollable, keyboard-focusable wrapper for wide tables on phones. */
export function TableScroll({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="visually-hidden">{children}</span>;
}
