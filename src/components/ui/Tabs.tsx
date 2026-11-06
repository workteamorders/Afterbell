"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Tabs.module.css";

/** Tab: tablist dengan panah kiri/kanan, Home, End (roving tabindex). */
export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ items, label, initial }: { items: readonly TabItem[]; label: string; initial?: string }) {
  const base = useId();
  const [active, setActive] = useState(initial ?? items[0]?.id ?? "");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (index: number) => {
    const target = items[(index + items.length) % items.length];
    if (!target) return;
    setActive(target.id);
    refs.current[target.id]?.focus();
  };

  const onKey = (e: KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") move(index + 1);
    else if (e.key === "ArrowLeft") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.list}>
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className={cx(styles.tab, active === t.id && styles.active)}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={active !== t.id}
          className={styles.panel}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
