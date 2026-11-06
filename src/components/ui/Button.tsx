"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/icons/Icon";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Menampilkan indikator dan menahan klik; lebar tombol tidak berubah. */
  loading?: boolean;
  icon?: IconName;
  iconPosition?: "start" | "end";
  /** Hanya ikon: `children` menjadi label aksesibel (aria-label), bukan teks terlihat. */
  iconOnly?: boolean;
  /** Hanya untuk /styleguide: memaksa tampilan state (hover, active). */
  forceState?: "hover" | "active" | "focus";
  children: ReactNode;
}

type ButtonProps = BaseProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { href?: undefined };
type LinkProps = BaseProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { href: string };

function Spinner() {
  return (
    <span className={styles.spinner} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
    </span>
  );
}

export function Button(props: ButtonProps | LinkProps) {
  const {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconPosition = "start",
    iconOnly = false,
    forceState,
    children,
    className,
    ...rest
  } = props;

  const classes = cx(
    styles.btn,
    styles[variant],
    styles[size],
    iconOnly && styles.iconOnly,
    loading && styles.loading,
    className,
  );
  const iconEl = icon ? <Icon name={icon} size={20} /> : null;
  const content = iconOnly ? (
    iconEl
  ) : (
    <>
      {icon && iconPosition === "start" ? iconEl : null}
      <span>{children}</span>
      {icon && iconPosition === "end" ? iconEl : null}
    </>
  );
  const common = {
    className: classes,
    "data-force": forceState,
    "aria-busy": loading || undefined,
  };

  if ("href" in props && props.href !== undefined) {
    const { href, onClick, ...anchorRest } = rest as Omit<LinkProps, keyof BaseProps>;
    const external = /^https?:\/\//.test(href);
    const handle = (e: MouseEvent<HTMLAnchorElement>) => {
      if (loading) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };
    const label = iconOnly ? String(children) : undefined;
    return external ? (
      <a {...common} {...anchorRest} href={href} onClick={handle} aria-label={label} target="_blank" rel="noopener noreferrer">
        <span className={styles.content}>{content}</span>
        {loading ? <Spinner /> : null}
      </a>
    ) : (
      <Link {...common} {...anchorRest} href={href} onClick={handle} aria-label={label}>
        <span className={styles.content}>{content}</span>
        {loading ? <Spinner /> : null}
      </Link>
    );
  }

  const { onClick, type = "button", ...buttonRest } = rest as Omit<ButtonProps, keyof BaseProps>;
  return (
    <button
      {...common}
      {...buttonRest}
      type={type}
      aria-label={iconOnly ? String(children) : buttonRest["aria-label"]}
      aria-disabled={loading || undefined}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      <span className={styles.content}>{content}</span>
      {loading ? <Spinner /> : null}
    </button>
  );
}
