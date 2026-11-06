"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LiquidityMeter } from "@/components/ui/LiquidityMeter";
import { cachedLiquidity, loadLiquidity, type LiquidityState } from "@/lib/liquidity-service";
import type { Token } from "@/lib/registry";
import styles from "./LiquidityPanel.module.css";

const REFRESH_MS = 30_000;

/**
 * Meter likuiditas untuk satu token. Data lama tetap terlihat saat penyegaran (skeleton hanya untuk pemuatan pertama).
 * Menyegarkan tiap 30 detik selama tab terlihat; kuotasi di-cache 10 detik dan dibatasi anggaran klien.
 */
export function LiquidityPanel({ token }: { token: Token }) {
  const [state, setState] = useState<LiquidityState | "loading">(() => cachedLiquidity(token.symbol) ?? "loading");
  const [updating, setUpdating] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setUpdating(true);
    try {
      const next = await loadLiquidity(token, undefined, c.signal);
      if (c.signal.aborted) return;
      // Bila penyegaran gagal tetapi ada data lama, pertahankan data lama.
      setState((prev) => (next.state === "unavailable" && typeof prev === "object" && prev.state === "ready" ? prev : next));
    } catch {
      /* dibatalkan */
    } finally {
      if (!c.signal.aborted) setUpdating(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => {
      clearInterval(id);
      ctl.current?.abort();
    };
  }, [refresh]);

  if (state === "loading") return <LiquidityMeter state="loading" />;
  if (state.state === "unavailable") {
    return (
      <div className={styles.wrap}>
        <LiquidityMeter
          state="unavailable"
          retry={
            <Button size="sm" variant="secondary" icon="refresh" loading={updating} onClick={() => void refresh()}>
              Try again
            </Button>
          }
        />
        <p className="type-note">{state.reason}</p>
      </div>
    );
  }
  const at = new Date(state.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <LiquidityMeter
      level={state.result.level}
      points={state.result.points}
      route={state.result.route}
      source={`Jupiter quotes, ${at}${updating ? ", updating" : ""}`}
    />
  );
}
