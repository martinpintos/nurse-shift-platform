import type { ReactNode } from "react";
import { Brand } from "./BrandMark";
import { Button } from "./ui/Button";
import { Skeleton, SkeletonGroup } from "./ui/Skeleton";
import styles from "./FullPageMessage.module.css";

/** Centered placeholder while the session resolves, or when it can't. */
export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <Brand />
      <div className={styles.body}>{children}</div>
    </main>
  );
}

export function SessionLoading() {
  return (
    <FullPageMessage>
      <SkeletonGroup label="your workspace" className={styles.skeleton}>
        <Skeleton width="70%" height={18} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="50%" height={12} />
      </SkeletonGroup>
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
      <Button variant="primary" onClick={onRetry}>
        Try again
      </Button>
    </FullPageMessage>
  );
}
