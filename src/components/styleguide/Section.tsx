import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Styleguide.module.css";

export function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-h`}>
      <header className={styles.sectionHead}>
        <h2 id={`${id}-h`} className="type-h2">
          {title}
        </h2>
        {intro ? <p className={cx("type-body", "muted")}>{intro}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Subjudul dalam satu seksi. */
export function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>
        <h3 className="type-label">{title}</h3>
        {note ? <p className="type-note">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Satu contoh dengan keterangan di bawahnya, mis. nama state. */
export function Specimen({ caption, children, wide }: { caption: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={cx(styles.specimen, wide && styles.wide)}>
      <div className={styles.specimenBody}>{children}</div>
      <figcaption className={cx(styles.caption, "type-num")}>{caption}</figcaption>
    </figure>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
