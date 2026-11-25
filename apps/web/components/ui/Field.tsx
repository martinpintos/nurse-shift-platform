import { useId, type ComponentProps, type ReactNode } from "react";
import styles from "./Field.module.css";

/**
 * A label above a control, with an optional hint below. `children` receives the id to put
 * on the control, so the label and hint are wired for screen readers.
 */
export function Field({
  label,
  hint,
  hideLabel = false,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  hideLabel?: boolean;
  className?: string;
  children: (ids: { id: string; hintId: string | undefined }) => ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label
        htmlFor={id}
        className={hideLabel ? "visually-hidden" : styles.label}
      >
        {label}
      </label>
      {children({ id, hintId: hint ? hintId : undefined })}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type ControlSize = "sm" | "md";

export function Input({
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"input">, "size"> & {
  size?: ControlSize;
}) {
  return (
    <input
      className={[styles.control, styles[size], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export function Select({
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<"select">, "size"> & {
  size?: ControlSize;
}) {
  return (
    <select
      className={[styles.control, styles.select, styles[size], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </select>
  );
}
