import { cx } from "@/lib/cx";
import styles from "./Skeleton.module.css";

/**
 * Kerangka pemuatan yang bentuknya meniru konten asli. Berdenyut lewat opacity saja
 * (tanpa reduced motion: statis). Bagian luar diberi aria-busy oleh pemakai.
 */
export function Skeleton({ shape = "line", className }: { shape?: "line" | "title" | "block" | "pill"; className?: string }) {
  return <span className={cx(styles.skeleton, styles[shape], className)} aria-hidden="true" />;
}

/** Baris tabel kerangka dengan jumlah kolom tetap. */
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className={styles.row} aria-hidden="true">
      {Array.from({ length: cols }, (_, i) => (
        <Skeleton key={i} shape={i === 0 ? "title" : "line"} />
      ))}
    </div>
  );
}
