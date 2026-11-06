import type { ReactNode } from "react";
import styles from "./Page.module.css";

/** Kepala halaman: label kecil, judul h1, kalimat pengantar. Latar kontur hidup ada di LiveBackground. */
export function PageHeader({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className={styles.header}>
      {eyebrow ? <p className="type-label muted">{eyebrow}</p> : null}
      <h1 className="type-h1">{title}</h1>
      {lead ? <p className={`type-body muted ${styles.lead}`}>{lead}</p> : null}
      {children}
    </header>
  );
}
