"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { NAV } from "@/lib/nav";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./SiteHeader.module.css";

/**
 * Header ringkas: logo, navigasi (tab aktif jelas lewat aria-current + garis bawah), tema, aksi wallet.
 * Di HP navigasi menjadi laci dengan penjebak fokus dan tombol tutup.
 * `currentOverride` hanya untuk /styleguide, agar state aktif bisa ditampilkan.
 */
export function SiteHeader({ walletSlot, currentOverride }: { walletSlot?: ReactNode; currentOverride?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = currentOverride ?? pathname;
  const isCurrent = (href: string) => current === href || current.startsWith(`${href}/`);

  return (
    <header className={styles.header}>
      <div className={cx("container", styles.row)}>
        <Link href="/" className={styles.home} aria-label="Afterbell, home">
          <Logo />
        </Link>

        <nav className={styles.nav} aria-label="Main">
          <ul role="list" className={styles.list}>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.link} aria-current={isCurrent(item.href) ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <ThemeToggle />
          <div className={styles.wallet}>{walletSlot}</div>
          <Button className={styles.menuBtn} variant="ghost" size="sm" icon="menu" iconOnly onClick={() => setOpen(true)} aria-haspopup="dialog">
            Open menu
          </Button>
        </div>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" variant="drawer">
        <nav aria-label="Main, mobile">
          <ul role="list" className={styles.drawerList}>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={styles.drawerLink}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {walletSlot ? <div className={styles.drawerWallet}>{walletSlot}</div> : null}
      </Dialog>
    </header>
  );
}
