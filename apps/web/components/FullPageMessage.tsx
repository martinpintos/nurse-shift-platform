import type { ReactNode } from "react";
import { Brand } from "./BrandMark";

/** Centered placeholder while the session resolves, or when it can't. */
export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <main className="full-page">
      <Brand />
      <div className="full-page-body">{children}</div>
    </main>
  );
}

export function SessionLoading() {
  return (
    <FullPageMessage>
      <p className="muted" role="status">
        Loading…
      </p>
    </FullPageMessage>
  );
}

export function SessionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <FullPageMessage>
      <p role="alert">{message}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    </FullPageMessage>
  );
}
