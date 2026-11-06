import type { ReactNode } from "react";
import { Notice } from "@/components/ui/StateBlock";
import { PageHeader } from "./PageHeader";
import styles from "./Page.module.css";

export interface DocSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Halaman teks panjang dengan daftar isi. Satu kolom bacaan di HP, daftar isi lengket di layar lebar. */
export function DocPage({
  eyebrow,
  title,
  lead,
  draft,
  sections,
}: {
  eyebrow?: string;
  title: string;
  lead: ReactNode;
  draft?: boolean;
  sections: readonly DocSection[];
}) {
  return (
    <div className={`container ${styles.page}`}>
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} />
      {draft ? (
        <Notice tone="warning" icon="alert" title="Draft awaiting legal review">
          This text has not been reviewed by a lawyer. It is not final and may change before public launch.
        </Notice>
      ) : null}
      <div className={styles.doc}>
        <nav aria-label="On this page" className={styles.toc}>
          <p className="type-label muted">On this page</p>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.prose}>
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className="type-h2">
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
