"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useEvmWallet, EvmWalletPicker } from "@/components/evm/EvmWalletProvider";
import { useWallet } from "@/components/providers/AppProviders";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/StateBlock";
import { WalletPicker, shortAddress } from "@/components/wallet/WalletButton";
import { formatNumber } from "@/lib/amounts";
import { CONFIG } from "@/lib/config";
import { loadHistory, type HistoryEntry } from "@/lib/history";
import { lamportsToSol, explorerUrl } from "@/lib/swap";
import { loadPortfolio, type Holding, type Portfolio } from "@/lib/portfolio";
import { EVM_CHAINS, getEvmChain } from "@/lib/evm/chains";
import { readDecimals, readErc20Balance } from "@/lib/evm/tokens";
import { EVM_TOKENS, TOKENS, getIssuer } from "@/lib/registry";
import styles from "./PortfolioView.module.css";

interface EvmHolding {
  symbol: string;
  name: string;
  issuer: string;
  ui: number;
}

/** Saldo token registry di Ethereum untuk dompet EVM yang terhubung. Dibaca langsung dari kontrak (balanceOf). */
function EvmSection() {
  const wallet = useEvmWallet();
  const [picker, setPicker] = useState(false);
  const [rows, setRows] = useState<EvmHolding[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const address = wallet.address;

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setFailed(false);
    try {
      const chain = getEvmChain("ethereum");
      if (!chain) throw new Error("no chain");
      const out = await Promise.all(
        EVM_TOKENS.map(async (t) => {
          const [bal, dec] = await Promise.all([readErc20Balance(chain, t.address, address), readDecimals(chain, t.address)]);
          return { symbol: t.symbol, name: t.name, issuer: t.issuer, ui: Number(bal) / 10 ** dec, raw: bal };
        }),
      );
      setRows(out.filter((r) => r.raw > 0n).map(({ raw: _raw, ...r }) => r));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const columns: Column<EvmHolding>[] = [
    {
      key: "token",
      header: "Token",
      sortValue: (h) => h.symbol.toLowerCase(),
      cell: (h) => (
        <Link href={`/e/${h.symbol}`}>
          <strong>{h.symbol}</strong> <span className="muted">{h.name}</span>
        </Link>
      ),
    },
    { key: "issuer", header: "Issuer", cell: (h) => getIssuer(h.issuer)?.name ?? h.issuer },
    { key: "amount", header: "Amount", numeric: true, sortValue: (h) => h.ui, cell: (h) => formatNumber(h.ui, 6) },
  ];

  return (
    <section aria-labelledby="eth-h" className={styles.history}>
      <h2 id="eth-h" className="type-h2">
        On Ethereum
      </h2>
      {wallet.status !== "connected" || !address ? (
        <div className={styles.compact}>
          <p className="muted">Ethereum balances need an Ethereum wallet. It is separate from your Solana wallet, and Afterbell cannot move anything without your approval.</p>
          <div>
            <Button variant="secondary" size="sm" icon="wallet" loading={wallet.status === "connecting"} onClick={() => setPicker(true)}>
              Connect Ethereum wallet
            </Button>
          </div>
          <EvmWalletPicker open={picker} onClose={() => setPicker(false)} />
        </div>
      ) : failed ? (
        <ErrorState
          title="Ethereum balances did not load"
          what="Afterbell could not read your balances from Ethereum."
          safety="Nothing was changed. Your funds are where they were."
          next="Try again in a moment."
          actions={
            <Button variant="primary" icon="refresh" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : !rows ? (
        <div className={styles.skeleton} aria-busy="true" role="status">
          <span className="sr-only">Loading Ethereum balances</span>
          <Skeleton shape="block" />
        </div>
      ) : rows.length === 0 ? (
        <p className="muted">
          No registry tokens found for <code>{shortAddress(address)}</code> on {EVM_CHAINS.ethereum.name}.
        </p>
      ) : (
        <>
          <p className="type-small muted">
            Showing <code>{shortAddress(address)}</code>
          </p>
          <DataTable caption="Registry tokens in your Ethereum wallet" columns={columns} rows={rows} rowKey={(h) => h.symbol} initialSort={{ key: "amount", dir: "desc" }} />
        </>
      )}
    </section>
  );
}

export function PortfolioView() {
  const wallet = useWallet();
  const [picker, setPicker] = useState(false);
  const [data, setData] = useState<Portfolio | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => setHistory(loadHistory()), []);

  const address = wallet.address;
  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setFailed(false);
    try {
      setData(await loadPortfolio(address, TOKENS));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const columns: Column<Holding>[] = [
    {
      key: "token",
      header: "Token",
      sortValue: (h) => h.token.symbol.toLowerCase(),
      cell: (h) => (
        <Link href={`/s/${h.token.symbol}`}>
          <strong>{h.token.symbol}</strong> <span className="muted">{h.token.name}</span>
        </Link>
      ),
    },
    { key: "issuer", header: "Issuer", cell: (h) => getIssuer(h.token.issuer)?.name ?? h.token.issuer },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      sortValue: (h) => h.ui,
      cell: (h) => (
        <span>
          {formatNumber(h.ui, 6)}
          {h.multiplier !== 1 ? <span className="type-note"> (×{h.multiplier})</span> : null}
        </span>
      ),
    },
  ];

  const held = data?.holdings.filter((h) => h.raw > 0n) ?? [];

  return (
    <div className={styles.wrap}>
      {wallet.status !== "connected" || !address ? (
        <EmptyState
          title="Connect a wallet to see what you hold"
          action={
            <>
              <Button variant="primary" icon="wallet" loading={wallet.status === "connecting"} onClick={() => setPicker(true)}>
                Connect wallet
              </Button>
              <WalletPicker open={picker} onClose={() => setPicker(false)} />
            </>
          }
        >
          Afterbell reads your balances from the chain. It cannot move anything without your approval in the wallet.
        </EmptyState>
      ) : (
        <>
          <div className={styles.bar}>
            <p className="type-small muted">
              Showing <code>{shortAddress(address)}</code>
              {data?.lamports != null ? <> · {lamportsToSol(data.lamports)} SOL for network fees</> : null}
            </p>
            <Button variant="secondary" size="sm" icon="refresh" loading={loading} onClick={() => void load()}>
              Refresh
            </Button>
          </div>

          {failed ? (
            <ErrorState
              title="Balances did not load"
              what="Afterbell could not read your balances from Solana."
              safety="Nothing was changed. Your funds are where they were."
              next="Try again in a moment."
              actions={
                <Button variant="primary" icon="refresh" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          ) : !data ? (
            <div className={styles.skeleton} aria-busy="true" role="status">
              <span className="sr-only">Loading balances</span>
              <Skeleton shape="block" />
              <Skeleton shape="line" />
              <Skeleton shape="line" />
            </div>
          ) : held.length === 0 ? (
            <EmptyState
              title="No registry tokens in this wallet"
              action={
                <Button variant="primary" href="/explore">
                  Explore tokens
                </Button>
              }
            >
              Nothing from the Afterbell registry was found in this wallet&apos;s standard token accounts.
            </EmptyState>
          ) : (
            <DataTable caption="Registry tokens in your wallet" columns={columns} rows={held} rowKey={(h) => h.token.mint} initialSort={{ key: "amount", dir: "desc" }} />
          )}
          <Notice tone="info" icon="info" title="What this page does not show">
            Only registry tokens held in the wallet&apos;s standard token accounts. Other tokens and non-standard accounts are not listed, so your wallet may show more. See <Link href="/help#balances">Help</Link>.
          </Notice>
        </>
      )}

      <EvmSection />

      <section aria-labelledby="hist-h" className={styles.history}>
        <h2 id="hist-h" className="type-h2">
          This visit
        </h2>
        {history.length === 0 ? (
          <p className="muted">Swaps you confirm in this tab appear here until you close it.</p>
        ) : (
          <ul role="list" className={styles.list}>
            {history.map((h) => (
              <li key={h.signature}>
                <span>
                  {h.side === "buy" ? "Bought" : "Sold"} {h.symbol}: {h.inAmount} {h.inSymbol} for {h.outAmount} {h.outSymbol}
                </span>
                <a href={explorerUrl(h.network === "ethereum" ? EVM_CHAINS.ethereum.explorerTx : CONFIG.explorerTxBase, h.signature)} target="_blank" rel="noopener noreferrer">
                  Explorer
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
