"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LiquidityMeter } from "@/components/ui/LiquidityMeter";
import { Notice } from "@/components/ui/StateBlock";
import styles from "@/components/token/LiquidityPanel.module.css";
import type { EvmChain } from "@/lib/evm/chains";
import { cachedEvmLiquidity, loadEvmLiquidity, type EvmLiquidityState } from "@/lib/evm/liquidity";
import type { EvmToken } from "@/lib/registry";

const REFRESH_MS = 30_000;

function usd(list: number[]) {
  return list.map((n) => `$${n.toLocaleString("en-US")}`).join(", ");
}

/** Meter likuiditas untuk token di Ethereum. Kolam kecil ditampilkan apa adanya: ukuran yang tidak bisa diisi disebut. */
export function EvmLiquidityPanel({ chain, token }: { chain: EvmChain; token: EvmToken }) {
  const [state, setState] = useState<EvmLiquidityState | "loading">(() => cachedEvmLiquidity(token) ?? "loading");
  const [updating, setUpdating] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    setUpdating(true);
    const next = await loadEvmLiquidity(chain, token);
    if (!alive.current) return;
    setState((prev) => (next.state === "unavailable" && typeof prev === "object" && prev.state !== "unavailable" ? prev : next));
    setUpdating(false);
  }, [chain, token]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => {
      alive.current = false;
      clearInterval(id);
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
  if (state.state === "limited") {
    return (
      <div className={styles.wrap}>
        <Notice tone="warning" icon="alert" title="Thin pool: some order sizes cannot be filled">
          {state.filledUsd.length === 0
            ? `Uniswap v3 on ${chain.name} could not fill even a $100 buy of ${token.symbol} just now.`
            : `Uniswap v3 on ${chain.name} could fill ${usd(state.filledUsd)} but not ${usd(state.unfilledUsd)}.`}{" "}
          A swap larger than the pool holds will be refused rather than filled at a bad price. Afterbell only checks the standard fee tiers, so a pool with another fee tier would not show here.
        </Notice>
        <Button size="sm" variant="secondary" icon="refresh" loading={updating} onClick={() => void refresh()}>
          Check again
        </Button>
      </div>
    );
  }
  const at = new Date(state.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return <LiquidityMeter level={state.result.level} points={state.result.points} route={state.result.route} source={`Uniswap v3 quotes on ${chain.name}, ${at}${updating ? ", updating" : ""}`} />;
}
