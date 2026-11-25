"use client";

import { formatFullDateTime, formatRelative } from "../../lib/format";
import { useNow } from "../../lib/use-now";

/** "5 minutes ago", with the full date and time on hover and for screen readers' context. */
export function RelativeTime({
  dateTime,
  className,
}: {
  dateTime: string;
  className?: string;
}) {
  const now = useNow();
  const full = formatFullDateTime(dateTime);
  return (
    <time dateTime={dateTime} title={full} className={className}>
      {formatRelative(dateTime, now)}
    </time>
  );
}
