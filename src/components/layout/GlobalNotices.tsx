"use client";

import { useEffect, useState } from "react";
import { useGeo } from "@/components/providers/AppProviders";
import { Notice } from "@/components/ui/StateBlock";
import styles from "./GlobalNotices.module.css";

/** Pemberitahuan lintas halaman: mode lihat-saja karena wilayah, dan koneksi terputus. */
export function GlobalNotices() {
  const geo = useGeo();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const showGeo = geo?.kind === "blocked" || geo?.kind === "unknown";
  if (online && !showGeo) return null;

  return (
    <div className={`container ${styles.stack}`}>
      {!online ? (
        <Notice tone="warning" icon="alert" title="You are offline">
          Showing what is already loaded. Prices, balances, and swaps need a connection. Your funds are not affected.
        </Notice>
      ) : null}
      {geo?.kind === "blocked" ? (
        <Notice tone="info" icon="lock" title="View-only mode">
          Buying and selling are not available in your region{geo.country ? ` (${geo.country})` : ""}. You can still browse tokens, read issuer information, and check liquidity.
        </Notice>
      ) : null}
      {geo?.kind === "unknown" ? (
        <Notice tone="info" icon="lock" title="View-only until your region is confirmed">
          Afterbell could not check your region, so buying and selling are switched off. {geo.reason} Reload the page to try again.
        </Notice>
      ) : null}
    </div>
  );
}
