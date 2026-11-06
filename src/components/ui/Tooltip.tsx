"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/icons/Icon";
import styles from "./Tooltip.module.css";

/**
 * Petunjuk: muncul saat hover dan fokus, dan bisa dibuka dengan ketukan di layar sentuh.
 * Esc menutupnya. Tidak pernah menjadi satu-satunya tempat informasi penting.
 */
interface InfoTipProps {
  /** Nama tombol untuk pembaca layar, mis. "About price impact". */
  label: string;
  children: string;
  forceOpen?: boolean;
}

export function InfoTip({ label, children, forceOpen }: InfoTipProps) {
  const id = useId();
  const [tapped, setTapped] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);

  /** Menggeser tooltip agar tidak keluar dari layar (tepi kiri/kanan viewport dengan jarak gutter). */
  const place = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.setProperty("--tip-shift", "0px");
    const r = tip.getBoundingClientRect();
    const edge = 16;
    const vw = document.documentElement.clientWidth;
    let shift = 0;
    if (r.left < edge) shift = edge - r.left;
    else if (r.right > vw - edge) shift = vw - edge - r.right;
    tip.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
  }, []);

  useLayoutEffect(() => {
    if (tapped || forceOpen) place();
  }, [tapped, forceOpen, place]);

  useEffect(() => {
    if (!tapped) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTapped(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tapped]);

  return (
    <span className={styles.wrap} data-open={tapped || forceOpen ? "true" : undefined} onPointerEnter={place} onFocus={place}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-describedby={id}
        onClick={() => setTapped((v) => !v)}
        onBlur={() => setTapped(false)}
      >
        <Icon name="info" size={16} />
      </button>
      <span ref={tipRef} role="tooltip" id={id} className={cx(styles.tip, "type-small")}>
        {children}
      </span>
    </span>
  );
}
