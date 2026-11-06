import styles from "./Ripple.module.css";

/**
 * Perayaan momen kunci (swap selesai): tiga riak kontur yang meluas satu kali. Hanya transform dan opacity.
 * Ganti `playKey` untuk memutar ulang. Dengan reduced motion, riak diganti fade singkat.
 */
export function Ripple({ playKey }: { playKey: number }) {
  return (
    <span className={styles.ripple} key={playKey} aria-hidden="true">
      <span className={styles.ring} />
      <span className={styles.ring} />
      <span className={styles.ring} />
    </span>
  );
}
