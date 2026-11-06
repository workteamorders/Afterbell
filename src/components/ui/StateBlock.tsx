import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Contour } from "@/components/brand/Contour";
import { Icon, type IconName } from "@/components/icons/Icon";
import styles from "./StateBlock.module.css";

/**
 * Status sistem. Keadaan kosong = ajakan bertindak (ilustrasi kontur kecil + satu kalimat + satu tombol).
 * Keadaan galat selalu menjawab tiga hal: apa yang terjadi, apakah dana dan data aman, apa yang bisa dilakukan sekarang.
 */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <div className={styles.art} aria-hidden="true">
        <Contour lines={5} seed={1.4} />
      </div>
      <h3 className="type-h3">{title}</h3>
      <p className={cx(styles.copy, "muted")}>{children}</p>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  what: string;
  safety: string;
  next: string;
  actions?: ReactNode;
}

export function ErrorState({ title, what, safety, next, actions }: ErrorStateProps) {
  return (
    <div className={styles.error} role="alert">
      <div className={styles.errorHead}>
        <Icon name="alert" size={24} />
        <h3 className="type-h3">{title}</h3>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt className="type-label">What happened</dt>
          <dd>{what}</dd>
        </div>
        <div>
          <dt className="type-label">Your funds and data</dt>
          <dd>{safety}</dd>
        </div>
        <div>
          <dt className="type-label">What you can do</dt>
          <dd>{next}</dd>
        </div>
      </dl>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

/** Banner informasi sebaris, mis. status pasar. Selalu ada ikon dan teks, tidak hanya warna. */
export function Notice({ tone = "info", icon, title, children }: { tone?: "info" | "warning" | "danger" | "success"; icon?: IconName; title: string; children?: ReactNode }) {
  const defaultIcon: Record<string, IconName> = { info: "info", warning: "alert", danger: "alert", success: "check" };
  return (
    <div className={cx(styles.notice, styles[tone])}>
      <Icon name={icon ?? defaultIcon[tone] ?? "info"} size={20} className={styles.noticeIcon} />
      <div>
        <p className={styles.noticeTitle}>{title}</p>
        {children ? <p className={styles.noticeBody}>{children}</p> : null}
      </div>
    </div>
  );
}
