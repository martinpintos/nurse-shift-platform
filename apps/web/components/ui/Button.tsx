import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * In flight: the button stays focusable and clickable (aria-disabled, not disabled), so
   * a test-ID button is never missing from the page; the handler ignores repeat clicks.
   */
  busy?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function buttonClassName({
  variant = "secondary",
  size = "md",
  block = false,
  className,
}: Pick<ButtonProps, "variant" | "size" | "block" | "className">): string {
  return [
    styles.button,
    styles[variant],
    styles[size],
    block ? styles.block : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  icon,
  block = false,
  className,
  type = "button",
  children,
  "aria-disabled": ariaDisabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, block, className })}
      {...props}
      aria-disabled={busy || ariaDisabled || undefined}
      data-busy={busy || undefined}
    >
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {children}
    </button>
  );
}
