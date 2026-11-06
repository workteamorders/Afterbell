"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/icons/Icon";
import styles from "./Badge.module.css";

/**
 * Badge: pendek, makna dibawa ikon dan teks (bukan warna saja).
 * Aturan produk: badge tidak boleh mengklaim sesuatu yang belum benar-benar diverifikasi sistem.
 * Karena itu tidak ada tone "verified" atau "safe"; teksnya dikirim oleh pemakai dan harus faktual.
 */
export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_ICON: Record<BadgeTone, IconName | null> = {
  neutral: null,
  success: "check",
  warning: "alert",
  danger: "x",
  info: "info",
};

interface BadgeProps {
  tone?: BadgeTone;
  icon?: IconName;
  children: ReactNode;
}

export function Badge({ tone = "neutral", icon, children }: BadgeProps) {
  const name = icon ?? TONE_ICON[tone];
  return (
    <span className={cx(styles.badge, styles[tone])}>
      {name ? <Icon name={name} size={16} /> : null}
      <span>{children}</span>
    </span>
  );
}

/** Chip: filter yang bisa dinyalakan. Selalu tombol, dengan aria-pressed dan penanda centang. */
interface ChipProps {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  disabled?: boolean;
  forceState?: "hover";
  children: ReactNode;
}

export function Chip({ pressed, onPressedChange, disabled, forceState, children }: ChipProps) {
  return (
    <button
      type="button"
      className={cx(styles.chip, pressed && styles.chipOn)}
      aria-pressed={pressed}
      disabled={disabled}
      data-force={forceState}
      onClick={() => onPressedChange(!pressed)}
    >
      {pressed ? <Icon name="check" size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}
