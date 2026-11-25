import type { ReactNode } from "react";
import styles from "./Text.module.css";

/**
 * An id or other secondary detail: small, monospace, quiet. A trailing space keeps the
 * id a separate word in the row's text ("shift-1 19:00", never "shift-119:00").
 */
export function IdText({ children }: { children: ReactNode }) {
  return (
    <>
      <span className={styles.id}>{children}</span>{" "}
    </>
  );
}

/** Initials in a circle, for the signed-in user. Decorative. */
export function Avatar({
  name,
  size = 36,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className ? `${styles.avatar} ${className}` : styles.avatar}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** "Maria Lopez" → "ML", "Sunrise Health Staffing" → "SH". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
