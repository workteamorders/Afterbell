"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Button } from "./Button";
import styles from "./Toast.module.css";

/**
 * Toast: judul singkat + satu baris. Hilang sendiri setelah 5 detik (berhenti saat hover atau fokus),
 * bisa ditutup, diumumkan pembaca layar lewat wilayah aria-live, dan ditaruh di tepi bawah
 * agar tidak menutupi aksi utama.
 */
export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ICONS: Record<ToastTone, IconName> = {
  neutral: "info",
  success: "check",
  warning: "alert",
  danger: "x",
};

const LIFETIME_MS = 5000;

export function ToastCard({ title, body, tone = "neutral", onClose, className }: ToastInput & { onClose?: () => void; className?: string }) {
  return (
    <div className={cx(styles.toast, styles[tone], className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={ICONS[tone]} size={20} className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {body ? <p className={cx(styles.body, "muted")}>{body}</p> : null}
      </div>
      {onClose ? (
        <Button variant="ghost" size="sm" icon="x" iconOnly onClick={onClose}>
          Dismiss notification
        </Button>
      ) : null}
    </div>
  );
}

function ToastEntry({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const timer = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    timer.current = window.setTimeout(() => onClose(item.id), LIFETIME_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [paused, item.id, onClose]);

  return (
    <li
      className={styles.entry}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ToastCard title={item.title} body={item.body} tone={item.tone} onClose={() => onClose(item.id)} />
    </li>
  );
}

interface ToastApi {
  push: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const close = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { ...toast, id }]);
  }, []);
  const api = useMemo<ToastApi>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className={styles.viewport} aria-label="Notifications">
        <ol className={styles.list} aria-live="polite" aria-relevant="additions">
          {items.map((item) => (
            <ToastEntry key={item.id} item={item} onClose={close} />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}
