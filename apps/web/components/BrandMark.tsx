/** The fictional ShiftPatch mark: a rounded patch with a cross. Decorative. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className="brand-mark"
    >
      <rect x="2" y="2" width="28" height="28" rx="9" fill="var(--accent)" />
      <path
        d="M16 9.5v13M9.5 16h13"
        stroke="var(--accent-contrast)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-name">ShiftPatch</span>
    </span>
  );
}
