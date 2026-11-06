import { cx } from "@/lib/cx";
import styles from "./Logo.module.css";

/** Tanda: tiga busur kontur naik dari garis air, seperti gema sounding. Kata: Afterbell. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 19h18" />
      <path d="M8 19a4 4 0 0 1 8 0" />
      <path d="M5 19a7 7 0 0 1 14 0" />
      <path d="M2.5 19a9.5 9.5 0 0 1 19 0" opacity="0.55" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx(styles.logo, className)}>
      <LogoMark />
      <span className={styles.word}>Afterbell</span>
    </span>
  );
}
