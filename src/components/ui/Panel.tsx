import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/icons/Icon";
import styles from "./Panel.module.css";

/**
 * Panel: satu gaya dasar. Terangkat = tint --surface-2 + garis rambut. Tenang = datar, hanya garis.
 * Panel statis tidak interaktif. PanelLink adalah SATU target dengan satu tautan utama.
 */
interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
  tone?: "raised" | "quiet";
}

export function Panel({ as: Tag = "div", tone = "raised", className, ...rest }: PanelProps) {
  return <Tag {...rest} className={cx(styles.panel, tone === "quiet" && styles.quiet, className)} />;
}

interface PanelLinkProps {
  href: string;
  title: string;
  children?: ReactNode;
  forceState?: "hover";
  className?: string;
}

export function PanelLink({ href, title, children, forceState, className }: PanelLinkProps) {
  return (
    <Link href={href} className={cx(styles.panel, styles.link, className)} data-force={forceState}>
      <span className={cx("type-h3", styles.linkTitle)}>
        {title}
        <Icon name="arrow-right" size={20} className={styles.arrow} />
      </span>
      {children ? <span className={cx(styles.linkBody, "muted")}>{children}</span> : null}
    </Link>
  );
}
