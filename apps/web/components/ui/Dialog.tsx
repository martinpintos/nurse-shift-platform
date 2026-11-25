"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Dialog.module.css";

/**
 * An in-app confirmation on a native modal <dialog> (focus trap, Escape and the top layer
 * come with it). Only "Reset demo data" uses one: claim, cancel, post and upload never ask.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const bodyId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={headingId}
      aria-describedby={bodyId}
      // Escape fires `cancel`; keep the state in charge of whether it is open.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={headingId} className={styles.title}>
        {title}
      </h2>
      <div id={bodyId} className={styles.body}>
        {children}
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel} autoFocus>
          Keep data
        </Button>
        <Button
          variant="primary"
          className={styles.destructive}
          busy={busy}
          onClick={() => {
            if (!busy) onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
