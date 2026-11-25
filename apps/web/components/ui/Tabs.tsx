"use client";

import { useRef, type KeyboardEvent } from "react";
import styles from "./Tabs.module.css";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Shown after the label; omit for no count. */
  count?: number;
}

function tabId(idBase: string, id: string) {
  return `${idBase}-tab-${id}`;
}

/** Props for the panel the tabs control: put them on the element holding the content. */
export function tabPanelProps(idBase: string, value: string) {
  return {
    role: "tabpanel" as const,
    id: `${idBase}-panel`,
    "aria-labelledby": tabId(idBase, value),
  };
}

/**
 * Controlled tabs with counts. Arrow keys, Home and End move and select (automatic
 * activation); only the selected tab is in the tab order.
 */
export function Tabs<T extends string>({
  label,
  idBase,
  items,
  value,
  onChange,
}: {
  label: string;
  idBase: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === value);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    if (event.key === "ArrowLeft")
      next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    const item = next === null ? undefined : items[next];
    if (!item) return;
    event.preventDefault();
    onChange(item.id);
    list.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(tabId(idBase, item.id))}`)
      ?.focus();
  }

  return (
    <div
      ref={list}
      className={styles.tabs}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            id={tabId(idBase, item.id)}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span className={styles.count}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
