"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/StateBlock";
import { MarketBadge } from "@/components/token/MarketNotice";
import { getEvmChain } from "@/lib/evm/chains";
import {
  cachedEvmLiquidity,
  loadEvmLiquidity,
  type EvmLiquidityState,
} from "@/lib/evm/liquidity";
import {
  cachedLiquidity,
  loadLiquidity,
  type LiquidityState,
} from "@/lib/liquidity-service";
import {
  EVM_TOKENS,
  ISSUERS,
  TOKENS,
  getIssuer,
  type EvmToken,
  type Token,
} from "@/lib/registry";
import styles from "./ExploreView.module.css";

/** Token pertama yang diukur otomatis. Sisanya lewat tombol, agar tidak menghabiskan anggaran kuotasi klien. */
const AUTO_LOAD = 4;
const LEVEL_TONE = {
  deep: "success",
  medium: "warning",
  thin: "danger",
} as const;
const LEVEL_LABEL = { deep: "Deep", medium: "Medium", thin: "Thin" } as const;

function useDepth(token: Token, auto: boolean) {
  const [state, setState] = useState<LiquidityState | "idle" | "loading">(
    () => cachedLiquidity(token.symbol) ?? "idle",
  );
  const run = useCallback(async () => {
    setState("loading");
    try {
      setState(await loadLiquidity(token));
    } catch {
      setState({ state: "unavailable", reason: "Could not load quotes." });
    }
  }, [token]);
  useEffect(() => {
    if (auto && state === "idle") void run();
  }, [auto, state, run]);
  return { state, run };
}

function DepthCell({ token, auto }: { token: Token; auto: boolean }) {
  const { state, run } = useDepth(token, auto);
  if (state === "loading") return <Skeleton shape="pill" />;
  if (state === "idle")
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void run()}
        aria-label={`Check depth for ${token.symbol}`}
      >
        Check depth
      </Button>
    );
  if (state.state === "unavailable")
    return (
      <Button
        size="sm"
        variant="ghost"
        icon="refresh"
        onClick={() => void run()}
        aria-label={`Retry depth for ${token.symbol}`}
      >
        Try again
      </Button>
    );
  const p = state.result.points[2];
  return (
    <span className={styles.depth}>
      <Badge tone={LEVEL_TONE[state.result.level]}>
        {LEVEL_LABEL[state.result.level]}
      </Badge>
      <span className="type-small muted">
        {p.impactPct.toFixed(2)}% at $10k
      </span>
    </span>
  );
}

type Network = "solana" | "ethereum";
interface Row {
  network: Network;
  symbol: string;
  name: string;
  underlying: string;
  issuer: string;
  key: string;
  href: string;
  sol?: Token;
  evm?: EvmToken;
}

const ROWS: Row[] = [
  ...TOKENS.map((t): Row => ({
    network: "solana",
    symbol: t.symbol,
    name: t.name,
    underlying: t.underlying,
    issuer: t.issuer,
    key: `sol:${t.mint}`,
    href: `/s/${t.symbol}`,
    sol: t,
  })),
  ...EVM_TOKENS.map((t): Row => ({
    network: "ethereum",
    symbol: t.symbol,
    name: t.name,
    underlying: t.underlying,
    issuer: t.issuer,
    key: `eth:${t.address}`,
    href: `/e/${t.symbol}`,
    evm: t,
  })),
];

function EvmDepthCell({ token }: { token: EvmToken }) {
  const chain = getEvmChain(token.chain);
  const [state, setState] = useState<EvmLiquidityState | "idle" | "loading">(
    () => cachedEvmLiquidity(token) ?? "idle",
  );
  const run = useCallback(async () => {
    if (!chain) return;
    setState("loading");
    setState(await loadEvmLiquidity(chain, token));
  }, [chain, token]);
  if (state === "loading") return <Skeleton shape="pill" />;
  if (state === "idle")
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void run()}
        aria-label={`Check depth for ${token.symbol} on Ethereum`}
      >
        Check depth
      </Button>
    );
  if (state.state === "unavailable")
    return (
      <Button
        size="sm"
        variant="ghost"
        icon="refresh"
        onClick={() => void run()}
        aria-label={`Retry depth for ${token.symbol} on Ethereum`}
      >
        Try again
      </Button>
    );
  if (state.state === "limited")
    return (
      <span className={styles.depth}>
        <Badge tone="danger">Thin pool</Badge>
        <span className="type-small muted">
          {state.filledUsd.length === 0
            ? "No $100 fill"
            : `Fills up to $${Math.max(...state.filledUsd).toLocaleString("en-US")}`}
        </span>
      </span>
    );
  const p = state.result.points[2];
  return (
    <span className={styles.depth}>
      <Badge tone={LEVEL_TONE[state.result.level]}>
        {LEVEL_LABEL[state.result.level]}
      </Badge>
      <span className="type-small muted">
        {p.impactPct.toFixed(2)}% at $10k
      </span>
    </span>
  );
}

export function ExploreView() {
  const [query, setQuery] = useState("");
  const [issuerId, setIssuerId] = useState<string | null>(null);
  const [network, setNetwork] = useState<Network | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ROWS.filter(
      (t) =>
        (!network || t.network === network) &&
        (!issuerId || t.issuer === issuerId) &&
        (!q ||
          `${t.symbol} ${t.name} ${t.underlying}`.toLowerCase().includes(q)),
    );
  }, [query, issuerId, network]);

  const autoSet = useMemo(
    () => new Set(TOKENS.slice(0, AUTO_LOAD).map((t) => t.symbol)),
    [],
  );

  const columns: Column<Row>[] = [
    {
      key: "token",
      header: "Token",
      sortValue: (t) => `${t.symbol.toLowerCase()}-${t.network}`,
      cell: (t) => (
        <Link href={t.href} className={styles.tokenLink}>
          <strong>{t.symbol}</strong> <span className="muted">{t.name}</span>
        </Link>
      ),
    },
    {
      key: "network",
      header: "Network",
      sortValue: (t) => t.network,
      cell: (t) => (t.network === "solana" ? "Solana" : "Ethereum"),
    },
    {
      key: "issuer",
      header: "Issuer",
      sortValue: (t) => getIssuer(t.issuer)?.name ?? "",
      cell: (t) => getIssuer(t.issuer)?.name ?? t.issuer,
    },
    {
      key: "rights",
      header: "What you hold",
      cell: (t) => getIssuer(t.issuer)?.rightsLabel ?? "",
    },
    {
      key: "depth",
      header: "Depth",
      cell: (t) =>
        t.sol ? (
          <DepthCell token={t.sol} auto={autoSet.has(t.symbol)} />
        ) : t.evm ? (
          <EvmDepthCell token={t.evm} />
        ) : null,
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.tools}>
        <TextField
          label="Search tokens"
          type="search"
          placeholder="Symbol or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        <div className={styles.filterRow}>
          <div className={styles.group} role="group" aria-labelledby="f-net">
            <span id="f-net" className="type-label">
              Network
            </span>
            <div className={styles.filters}>
              <Chip
                pressed={network === null}
                onPressedChange={() => setNetwork(null)}
              >
                All networks
              </Chip>
              <Chip
                pressed={network === "solana"}
                onPressedChange={(on) => setNetwork(on ? "solana" : null)}
              >
                Solana
              </Chip>
              <Chip
                pressed={network === "ethereum"}
                onPressedChange={(on) => setNetwork(on ? "ethereum" : null)}
              >
                Ethereum
              </Chip>
            </div>
          </div>
          <div className={styles.group} role="group" aria-labelledby="f-iss">
            <span id="f-iss" className="type-label">
              Issuer
            </span>
            <div className={styles.filters}>
              <Chip
                pressed={issuerId === null}
                onPressedChange={() => setIssuerId(null)}
              >
                All issuers
              </Chip>
              {ISSUERS.filter((i) => ROWS.some((t) => t.issuer === i.id)).map(
                (i) => (
                  <Chip
                    key={i.id}
                    pressed={issuerId === i.id}
                    onPressedChange={(on) => setIssuerId(on ? i.id : null)}
                  >
                    {i.name}
                  </Chip>
                ),
              )}
            </div>
          </div>
        </div>
        <div>
          <MarketBadge />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No tokens match"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setIssuerId(null);
                setNetwork(null);
              }}
            >
              Clear search and filters
            </Button>
          }
        >
          Try a different symbol, or clear the filters.
        </EmptyState>
      ) : (
        <DataTable
          caption="Tokenized stocks in the Afterbell registry"
          columns={columns}
          rows={rows}
          rowKey={(t) => t.key}
          initialSort={{ key: "token", dir: "asc" }}
        />
      )}
      <p className="type-note">
        Depth comes from live quotes at $100, $1,000, and $10,000 (Jupiter on
        Solana, Uniswap v3 on Ethereum) and is cached for a few seconds. How it
        is measured: <Link href="/methodology#liquidity">Methodology</Link>.
      </p>
    </div>
  );
}
