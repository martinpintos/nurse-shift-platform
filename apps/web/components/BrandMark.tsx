import styles from "./BrandMark.module.css";

/** The fictional ShiftPatch mark: three staggered shift bars. Decorative. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={styles.mark}
    >
      <rect x="3" y="7" width="26" height="4" rx="2" fill="currentColor" />
      <rect x="9" y="14" width="20" height="4" rx="2" fill="currentColor" />
      <rect x="3" y="21" width="16" height="4" rx="2" fill="currentColor" />
    </svg>
  );
}

/** The mark and the name. `onDark` for the navy shell, otherwise navy on light. */
export function Brand({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className={styles.brand} data-on-dark={onDark || undefined}>
      <BrandMark />
      <span className={styles.name}>ShiftPatch</span>
    </span>
  );
}
