"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import styles from "./Dialog.module.css";

/**
 * Dialog, bottom sheet (otomatis di HP), dan laci (drawer) memakai <dialog> native:
 * fokus terjebak di dalam, Esc menutup, fokus kembali ke pemicu, dan latar tidak bisa difokus.
 * Latar tidak bisa di-scroll (kelas scroll-locked di body).
 * Tombol utama selalu di sisi kanan (akhir) pada baris aksi.
 */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  variant?: "dialog" | "drawer";
  children?: ReactNode;
  /** Baris aksi. Tombol utama terakhir. */
  actions?: ReactNode;
}

export function Dialog({ open, onClose, title, description, variant = "dialog", children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("scroll-locked");
    return () => document.body.classList.remove("scroll-locked");
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, variant === "drawer" && styles.drawer)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <h2 id={titleId} className="type-h3">
            {title}
          </h2>
          <Button variant="ghost" size="sm" icon="x" iconOnly onClick={onClose}>
            Close
          </Button>
        </header>
        {description ? (
          <p id={descId} className={cx(styles.description, "muted")}>
            {description}
          </p>
        ) : null}
        {children ? <div className={styles.body}>{children}</div> : null}
        {actions ? <footer className={styles.actions}>{actions}</footer> : null}
      </div>
    </dialog>
  );
}
