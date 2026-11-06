"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ripple } from "@/components/brand/Ripple";
import { useEvmWallet, EvmWalletPicker } from "@/components/evm/EvmWalletProvider";
import { useGeo, useMarket } from "@/components/providers/AppProviders";
import { Row, RiskDialog, useDebounced } from "@/components/swap/SwapPanel";
import styles from "@/components/swap/SwapPanel.module.css";
import { RestrictionText } from "@/components/token/RightsPanel";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { SliderField, TextField } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState, Notice } from "@/components/ui/StateBlock";
import { formatNumber, parseDecimalToRaw, rawToDecimalString } from "@/lib/amounts";
import type { EvmChain } from "@/lib/evm/chains";
import { quoteExactIn, type EvmQuote } from "@/lib/evm/quote";
import { ethCall, ethEstimateGas, ethGasPrice, ethGetBalance, ethGetReceipt, type EvmReceipt } from "@/lib/evm/rpc";
import { buildApprove, buildSwap, explainEvmError, formatWei, minAmountOut, receiptSucceeded, receivedFromReceipt, type Call } from "@/lib/evm/swap";
import { readAllowance, readDecimals, readErc20Balance } from "@/lib/evm/tokens";
import { isUserRejection } from "@/lib/evm/wallet";
import { canTrade } from "@/lib/geo";
import { addHistory } from "@/lib/history";
import { RpcError } from "@/lib/rpc";
import type { EvmToken, Issuer } from "@/lib/registry";
import { KEYS, readLocal, writeLocal } from "@/lib/storage";
import { explorerUrl, type FriendlyError } from "@/lib/swap";

type Side = "buy" | "sell";
const DEFAULT_SLIPPAGE_BPS = 50;
const DEADLINE_SECS = 20 * 60;
const QUOTE_MAX_AGE_MS = 30_000;
const SAFE_NOT_SENT = "Nothing was sent from your wallet.";

interface Pair {
  side: Side;
  inAddr: string;
  inDecimals: number;
  inSymbol: string;
  outAddr: string;
  outDecimals: number;
  outSymbol: string;
}

function pairFor(chain: EvmChain, token: EvmToken, tokenDecimals: number, side: Side): Pair {
  return side === "buy"
    ? { side, inAddr: chain.usdc.address, inDecimals: chain.usdc.decimals, inSymbol: "USDC", outAddr: token.address, outDecimals: tokenDecimals, outSymbol: token.symbol }
    : { side, inAddr: token.address, inDecimals: tokenDecimals, inSymbol: token.symbol, outAddr: chain.usdc.address, outDecimals: chain.usdc.decimals, outSymbol: "USDC" };
}

function tierLabel(fee: number): string {
  return `${(fee / 10_000).toFixed(2)}% fee tier`;
}

export function EvmSwapPanel({ chain, token, issuer }: { chain: EvmChain; token: EvmToken; issuer: Issuer }) {
  const geo = useGeo();
  const wallet = useEvmWallet();
  const market = useMarket();

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_BPS);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [decimalsError, setDecimalsError] = useState(false);
  const [bal, setBal] = useState<{ usdc: bigint; token: bigint; eth: bigint } | null>(null);
  const [balError, setBalError] = useState(false);
  const [indicative, setIndicative] = useState<{ state: "idle" } | { state: "loading" } | { state: "ok"; out: bigint } | { state: "none" } | { state: "error"; message: string }>({ state: "idle" });
  const [picker, setPicker] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [review, setReview] = useState(false);

  useEffect(() => {
    const saved = Number(readLocal(KEYS.slippage));
    if (Number.isFinite(saved) && saved >= 10 && saved <= 300) setSlippage(saved);
  }, []);

  useEffect(() => {
    let live = true;
    setDecimalsError(false);
    readDecimals(chain, token.address)
      .then((d) => live && setDecimals(d))
      .catch(() => live && setDecimalsError(true));
    return () => {
      live = false;
    };
  }, [chain, token.address]);

  const pair = useMemo(() => (decimals === null ? null : pairFor(chain, token, decimals, side)), [chain, token, decimals, side]);
  const raw = useMemo(() => (pair ? parseDecimalToRaw(amount, pair.inDecimals) : null), [amount, pair]);

  const address = wallet.address;
  const loadBal = useCallback(() => {
    if (!address) return;
    setBalError(false);
    Promise.all([readErc20Balance(chain, chain.usdc.address, address), readErc20Balance(chain, token.address, address), ethGetBalance(chain, address)])
      .then(([usdc, tok, eth]) => setBal({ usdc, token: tok, eth }))
      .catch(() => setBalError(true));
  }, [address, chain, token.address]);
  useEffect(() => {
    setBal(null);
    loadBal();
  }, [loadBal]);

  const balanceRaw = bal ? (side === "buy" ? bal.usdc : bal.token) : null;
  const balanceUi = balanceRaw !== null && pair ? Number(balanceRaw) / 10 ** pair.inDecimals : null;

  const error = useMemo(() => {
    if (!touched || !pair) return undefined;
    if (amount.trim() === "") return "Enter an amount to continue";
    if (raw === null) return `Use numbers only, with up to ${pair.inDecimals} decimal places`;
    if (raw <= 0n) return "Amount must be more than 0 and no more than your balance";
    if (balanceRaw !== null && raw > balanceRaw) return "Amount must be more than 0 and no more than your balance";
    return undefined;
  }, [touched, amount, raw, balanceRaw, pair]);

  const debouncedRaw = useDebounced(raw, 450);
  useEffect(() => {
    if (!pair || !debouncedRaw || debouncedRaw <= 0n) {
      setIndicative({ state: "idle" });
      return;
    }
    let live = true;
    setIndicative({ state: "loading" });
    quoteExactIn(chain, pair.inAddr, pair.outAddr, debouncedRaw)
      .then((q) => live && setIndicative(q ? { state: "ok", out: q.amountOut } : { state: "none" }))
      .catch((e: unknown) => live && setIndicative({ state: "error", message: e instanceof RpcError ? e.message : "Could not get a price." }));
    return () => {
      live = false;
    };
  }, [debouncedRaw, pair, chain]);

  const onReview = () => {
    setTouched(true);
    if (!raw || raw <= 0n || (balanceRaw !== null && raw > balanceRaw)) return;
    if (readLocal(KEYS.riskAck) !== "1") setRiskOpen(true);
    else setReview(true);
  };

  const tradable = canTrade(geo);

  if (geo === undefined) {
    return (
      <Panel as="section" aria-label="Swap" aria-busy="true" className={`${styles.panel} ${styles.loadingPanel}`}>
        <Skeleton shape="title" />
        {issuer.restrictsUsPersons ? (
          <Notice tone="warning" icon="alert" title={`Check ${issuer.name}'s regional limits first`}>
            <RestrictionText issuer={issuer} />
          </Notice>
        ) : null}
        <Skeleton shape="block" />
        <Skeleton shape="pill" />
      </Panel>
    );
  }
  if (!tradable) {
    return (
      <Panel as="section" aria-labelledby="swap-h" className={styles.panel}>
        <h2 id="swap-h" className="type-h3">
          {token.symbol} is view-only here
        </h2>
        <Notice tone="info" icon="lock" title="Buying and selling are off">
          {geo.kind === "blocked" ? "Buying and selling are not available in your region." : "Afterbell could not confirm your region, so buying and selling stay off."} You can still read everything on this page.
        </Notice>
        <p className="type-note">
          Why? See <Link href="/help#viewonly">Help</Link>.
        </p>
      </Panel>
    );
  }

  const wrongChain = wallet.status === "connected" && wallet.chainId !== null && wallet.chainId !== chain.chainId;
  const setSideReset = (s: Side) => {
    setSide(s);
    setAmount("");
    setTouched(false);
  };

  return (
    <Panel as="section" aria-labelledby="swap-h" className={styles.panel}>
      <div className={styles.head}>
        <h2 id="swap-h" className="type-h3">
          {side === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`} on {chain.name}
        </h2>
        <div className={styles.sides} role="group" aria-label="Direction">
          <Chip pressed={side === "buy"} onPressedChange={() => setSideReset("buy")}>
            Buy
          </Chip>
          <Chip pressed={side === "sell"} onPressedChange={() => setSideReset("sell")}>
            Sell
          </Chip>
        </div>
      </div>

      {issuer.restrictsUsPersons ? (
        <Notice tone="warning" icon="alert" title={`Check ${issuer.name}'s regional limits first`}>
          <RestrictionText issuer={issuer} />
        </Notice>
      ) : null}

      {market?.state === "closed" ? <p className="type-note">US market is closed. The token price is set by on-chain demand and can differ from the stock price.</p> : null}

      {decimalsError ? (
        <Notice tone="danger" icon="alert" title="Token details could not be read">
          Afterbell reads this token&apos;s decimals from {chain.name}. It could not, so swaps stay off until it can. Reload the page to try again.
        </Notice>
      ) : null}

      <TextField
        label={side === "buy" ? "You pay" : "You sell"}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        suffix={pair?.inSymbol ?? ""}
        value={amount}
        error={error}
        disabled={!pair}
        help={
          balanceUi !== null && pair
            ? `Balance: ${formatNumber(balanceUi, pair.inDecimals > 6 ? 6 : 4)} ${pair.inSymbol}`
            : wallet.status === "connected"
              ? balError
                ? "Balance unavailable right now"
                : "Loading balance…"
              : "Connect a wallet to see your balance"
        }
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => setTouched(true)}
      />
      {balanceRaw !== null && balanceRaw > 0n && pair ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAmount(rawToDecimalString(balanceRaw, pair.inDecimals));
              setTouched(true);
            }}
          >
            Use full balance
          </Button>
        </div>
      ) : null}

      <div className={styles.receive} aria-live="polite">
        <span className="type-label">You receive about</span>
        {indicative.state === "loading" ? (
          <Skeleton shape="title" />
        ) : indicative.state === "ok" && pair ? (
          <p className={`type-num ${styles.receiveAmount}`}>
            {formatNumber(Number(indicative.out) / 10 ** pair.outDecimals, pair.outDecimals > 6 ? 6 : 4)} {pair.outSymbol}
          </p>
        ) : indicative.state === "none" ? (
          <p className="type-small">No Uniswap v3 pool can fill this amount. Try a smaller amount.</p>
        ) : indicative.state === "error" ? (
          <p className="type-small">{indicative.message}</p>
        ) : (
          <p className="type-small muted">Enter an amount to see a price.</p>
        )}
      </div>

      <details className={styles.advanced}>
        <summary>Slippage tolerance: {(slippage / 100).toFixed(1)}%</summary>
        <SliderField
          label="Slippage tolerance"
          min={0.1}
          max={3}
          step={0.1}
          value={slippage / 100}
          format={(n) => `${n.toFixed(1)}%`}
          onValueChange={(n) => {
            const bps = Math.round(n * 100);
            setSlippage(bps);
            writeLocal(KEYS.slippage, String(bps));
          }}
          help="The most the price may move against you before the swap is cancelled. Higher lets a trade succeed at a worse price."
        />
      </details>

      <div className={styles.action}>
        {wallet.status !== "connected" ? (
          <>
            <Button variant="primary" size="lg" icon="wallet" loading={wallet.status === "connecting"} onClick={() => setPicker(true)}>
              Connect wallet
            </Button>
            <EvmWalletPicker open={picker} onClose={() => setPicker(false)} />
          </>
        ) : wrongChain ? (
          <Button variant="primary" size="lg" onClick={() => void wallet.ensureChain(chain.chainId)}>
            Switch wallet to {chain.name}
          </Button>
        ) : (
          <Button variant="primary" size="lg" icon="arrow-right" iconPosition="end" disabled={!pair} onClick={onReview}>
            {side === "buy" ? `Review buy of ${token.symbol}` : `Review sell of ${token.symbol}`}
          </Button>
        )}
        <p className="type-note">
          You see the full cost before you sign. Swaps go through Uniswap v3 on {chain.name}. <Link href="/methodology#ethereum">How Ethereum swaps work</Link>.
        </p>
      </div>

      <RiskDialog
        open={riskOpen}
        onClose={() => setRiskOpen(false)}
        onAccept={() => {
          writeLocal(KEYS.riskAck, "1");
          setRiskOpen(false);
          setReview(true);
        }}
      />
      {review && raw && pair && address ? (
        <EvmReviewDialog
          chain={chain}
          token={token}
          issuer={issuer}
          pair={pair}
          taker={address}
          amountRaw={raw}
          slippageBps={slippage}
          ethBalance={bal?.eth}
          onClose={(done) => {
            setReview(false);
            if (done) {
              setAmount("");
              setTouched(false);
              loadBal();
            }
          }}
        />
      ) : null}
    </Panel>
  );
}

/* ---------------- Ringkasan, persetujuan, simulasi, kirim, bukti ---------------- */
interface Prepared {
  quote: EvmQuote;
  minOut: bigint;
  call: Call;
  gas: bigint;
  gasPrice: bigint;
  builtAt: number;
}

type Step =
  | { k: "building" }
  | { k: "problem"; err: FriendlyError }
  | { k: "approve"; quote: EvmQuote; gas: bigint | null; gasPrice: bigint | null }
  | { k: "approving"; hash: string | null }
  | { k: "simulating" }
  | { k: "ready"; p: Prepared }
  | { k: "signing"; p: Prepared }
  | { k: "pending"; p: Prepared; hash: string }
  | { k: "done"; p: Prepared; hash: string; received?: bigint }
  | { k: "failed"; err: FriendlyError; hash?: string };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForReceipt(chain: EvmChain, hash: string, signal: { cancelled: boolean }): Promise<EvmReceipt | null> {
  for (let i = 0; i < 60 && !signal.cancelled; i++) {
    const r = await ethGetReceipt(chain, hash).catch(() => null);
    if (r) return r;
    await sleep(3000);
  }
  return null;
}

function EvmReviewDialog({
  chain,
  token,
  issuer,
  pair,
  taker,
  amountRaw,
  slippageBps,
  ethBalance,
  onClose,
}: {
  chain: EvmChain;
  token: EvmToken;
  issuer: Issuer;
  pair: Pair;
  taker: string;
  amountRaw: bigint;
  slippageBps: number;
  ethBalance?: bigint;
  onClose: (done: boolean) => void;
}) {
  const wallet = useEvmWallet();
  const [step, setStep] = useState<Step>({ k: "building" });
  const [celebrate, setCelebrate] = useState(0);
  const run = useRef(0);
  const cancel = useRef({ cancelled: false });

  useEffect(() => {
    cancel.current = { cancelled: false };
    const c = cancel.current;
    return () => {
      c.cancelled = true;
    };
  }, []);

  const fail = useCallback((e: unknown, fallback: string) => {
    if (e instanceof RpcError) {
      const err =
        e.kind === "rpc"
          ? explainEvmError(e.message, { nativeSymbol: chain.nativeSymbol })
          : { what: e.kind === "rate-limited" ? "Too many requests were made in a short time." : e.message, safety: SAFE_NOT_SENT, next: "Try again in a moment." };
      return { k: "failed", err } as const;
    }
    return { k: "failed", err: { what: fallback, safety: SAFE_NOT_SENT, next: "Try again." } } as const;
  }, [chain.nativeSymbol]);

  /** Kuotasi segar, lalu cek approval. Bila sudah cukup, simulasikan swap. */
  const build = useCallback(async () => {
    const id = ++run.current;
    setStep({ k: "building" });
    try {
      const quote = await quoteExactIn(chain, pair.inAddr, pair.outAddr, amountRaw);
      if (id !== run.current) return;
      if (!quote) {
        return setStep({ k: "problem", err: { what: "No Uniswap v3 pool can fill this amount right now.", safety: SAFE_NOT_SENT, next: "Try a smaller amount. The pool for this token may be small." } });
      }
      const allowance = await readAllowance(chain, pair.inAddr, taker, chain.uniswapV3.swapRouter02);
      if (id !== run.current) return;
      if (allowance < amountRaw) {
        const approve = buildApprove(chain, pair.inAddr, amountRaw);
        const [gas, gasPrice] = await Promise.all([
          ethEstimateGas(chain, { from: taker, to: approve.to, data: approve.data }).catch(() => null),
          ethGasPrice(chain).catch(() => null),
        ]);
        if (id !== run.current) return;
        return setStep({ k: "approve", quote, gas, gasPrice });
      }
      await simulate(id, quote);
    } catch (e) {
      if (id === run.current) setStep(fail(e, "Something went wrong while preparing this swap."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, pair.inAddr, pair.outAddr, amountRaw, taker, fail]);

  const simulate = async (id: number, quote: EvmQuote) => {
    setStep({ k: "simulating" });
    const minOut = minAmountOut(quote.amountOut, slippageBps);
    const call = buildSwap(chain, {
      tokenIn: pair.inAddr,
      tokenOut: pair.outAddr,
      fee: quote.fee,
      recipient: taker,
      amountIn: amountRaw,
      amountOutMinimum: minOut,
      deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECS),
    });
    try {
      // Simulasi: eth_call dari alamat pengguna. Gagal = kontrak akan menolak. Tidak ada yang dikirim.
      await ethCall(chain, { from: taker, to: call.to, data: call.data });
      const [gas, gasPrice] = await Promise.all([ethEstimateGas(chain, { from: taker, to: call.to, data: call.data }), ethGasPrice(chain)]);
      if (id !== run.current) return;
      setStep({ k: "ready", p: { quote, minOut, call, gas, gasPrice, builtAt: Date.now() } });
    } catch (e) {
      if (id !== run.current) return;
      setStep(e instanceof RpcError && e.kind === "rpc" ? { k: "problem", err: explainEvmError(e.message, { nativeSymbol: chain.nativeSymbol }) } : fail(e, "The pre-check could not run."));
    }
  };

  useEffect(() => {
    void build();
    return () => {
      run.current++;
    };
  }, [build]);

  const sendAndWait = async (call: Call) => {
    if (!(await wallet.ensureChain(chain.chainId))) throw Object.assign(new Error("Wrong network"), { wrongChain: true });
    return wallet.send({ to: call.to, data: call.data });
  };

  const doApprove = async (quote: EvmQuote) => {
    setStep({ k: "approving", hash: null });
    try {
      const approve = buildApprove(chain, pair.inAddr, amountRaw);
      // Simulasi persetujuan sebelum diminta tanda tangan.
      await ethCall(chain, { from: taker, to: approve.to, data: approve.data });
      const hash = await sendAndWait(approve);
      setStep({ k: "approving", hash });
      const receipt = await waitForReceipt(chain, hash, cancel.current);
      if (cancel.current.cancelled) return;
      if (!receipt || !receiptSucceeded(receipt)) {
        return setStep({ k: "failed", hash, err: { what: receipt ? "The approval transaction failed." : "The approval has not confirmed yet.", safety: "Only the approval is affected. No swap was sent and no tokens moved.", next: "Check the explorer link, then review again." } });
      }
      const id = ++run.current;
      await simulate(id, quote);
    } catch (e) {
      setStep(walletFailure(e));
    }
  };

  const walletFailure = (e: unknown): Step => {
    if ((e as { wrongChain?: boolean }).wrongChain) return { k: "failed", err: { what: `Your wallet is not on ${chain.name}.`, safety: SAFE_NOT_SENT, next: `Switch the wallet to ${chain.name} and review again.` } };
    if (isUserRejection(e)) return { k: "failed", err: { what: "You declined the request in your wallet.", safety: SAFE_NOT_SENT, next: "Review the swap again when you are ready." } };
    if (e instanceof RpcError) return fail(e, "The pre-check could not run.");
    return { k: "failed", err: { what: "The wallet did not send the transaction.", safety: SAFE_NOT_SENT, next: "Review the swap again." } };
  };

  const confirm = async (p: Prepared) => {
    if (Date.now() - p.builtAt > QUOTE_MAX_AGE_MS) return void build();
    setStep({ k: "signing", p });
    let hash: string;
    try {
      hash = await sendAndWait(p.call);
    } catch (e) {
      return setStep(walletFailure(e));
    }
    setStep({ k: "pending", p, hash });
    const receipt = await waitForReceipt(chain, hash, cancel.current);
    if (cancel.current.cancelled) return;
    if (!receipt) {
      return setStep({
        k: "failed",
        hash,
        err: {
          what: "The swap was sent, but Afterbell has not seen it confirm yet.",
          safety: "It may still go through. Do not repeat it until you have checked.",
          next: "Open the explorer link to see its status, or check your wallet history.",
        },
      });
    }
    if (!receiptSucceeded(receipt)) {
      return setStep({ k: "failed", hash, err: { what: "The swap transaction failed on Ethereum.", safety: "A failed swap does not move your tokens. You still paid the network fee.", next: "Review the swap again for a fresh quote." } });
    }
    const received = receivedFromReceipt(receipt, pair.outAddr, taker);
    addHistory({
      signature: hash,
      network: "ethereum",
      at: Date.now(),
      side: pair.side,
      symbol: token.symbol,
      inAmount: rawToDecimalString(amountRaw, pair.inDecimals, 6),
      inSymbol: pair.inSymbol,
      outAmount: received !== undefined ? rawToDecimalString(received, pair.outDecimals, 6) : "?",
      outSymbol: pair.outSymbol,
    });
    setCelebrate((n) => n + 1);
    setStep({ k: "done", p, hash, received });
  };

  const busy = step.k === "signing" || step.k === "pending" || step.k === "approving";
  const done = step.k === "done";
  const lowEth = ethBalance !== undefined && ethBalance === 0n;

  return (
    <Dialog
      open
      onClose={() => (busy ? undefined : onClose(done))}
      title={done ? "Swap confirmed" : pair.side === "buy" ? `Review: buy ${token.symbol}` : `Review: sell ${token.symbol}`}
      description={done ? "Your wallet sent it and Ethereum confirmed it." : "Check the full cost. Nothing is sent until you confirm in your wallet."}
      actions={
        step.k === "ready" ? (
          <>
            <Button variant="ghost" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="wallet" onClick={() => void confirm(step.p)}>
              Swap in wallet
            </Button>
          </>
        ) : step.k === "approve" ? (
          <>
            <Button variant="ghost" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="wallet" onClick={() => void doApprove(step.quote)}>
              Approve {pair.inSymbol} in wallet
            </Button>
          </>
        ) : step.k === "problem" || (step.k === "failed" && !step.hash) ? (
          <>
            <Button variant="ghost" onClick={() => onClose(false)}>
              Close
            </Button>
            <Button variant="primary" icon="refresh" onClick={() => void build()}>
              Get a fresh quote
            </Button>
          </>
        ) : step.k === "failed" ? (
          <Button variant="ghost" onClick={() => onClose(false)}>
            Close
          </Button>
        ) : done ? (
          <Button variant="primary" onClick={() => onClose(true)}>
            Done
          </Button>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => onClose(false)}>
            Cancel
          </Button>
        )
      }
    >
      {step.k === "building" || step.k === "simulating" ? (
        <div className={styles.working} aria-busy="true" role="status">
          <Skeleton shape="line" />
          <Skeleton shape="block" />
          <p className="type-small muted">{step.k === "building" ? "Getting a quote and checking your approval…" : "Checking the swap with a simulation. Nothing is sent."}</p>
        </div>
      ) : null}

      {step.k === "problem" || step.k === "failed" ? (
        <>
          <ErrorState title={step.k === "problem" ? "This swap cannot go ahead" : "The swap did not complete"} what={step.err.what} safety={step.err.safety} next={step.err.next} />
          {step.k === "failed" && step.hash ? (
            <p className="type-small">
              <a href={explorerUrl(chain.explorerTx, step.hash)} target="_blank" rel="noopener noreferrer">
                Open this transaction in the explorer
              </a>
            </p>
          ) : null}
        </>
      ) : null}

      {step.k === "approve" || step.k === "approving" ? (
        <div className={styles.summary}>
          <Notice tone="info" icon="info" title="Step 1 of 2: approve the exact amount">
            Uniswap needs your permission to move {rawToDecimalString(amountRaw, pair.inDecimals, 6)} {pair.inSymbol} from your wallet. Afterbell asks for exactly this amount, not unlimited access. You then sign the swap as a second transaction.
          </Notice>
          {step.k === "approve" && step.gas !== null && step.gasPrice !== null ? (
            <dl className={styles.rows}>
              <Row label="Approval network fee" value={`about ${formatWei(step.gas * step.gasPrice)} ${chain.nativeSymbol}`} hint="Paid in ETH to Ethereum validators. It is not paid to Afterbell or Uniswap." />
            </dl>
          ) : null}
          {lowEth ? <p className="type-small">Your wallet shows no {chain.nativeSymbol}. You need some to pay network fees.</p> : null}
          {step.k === "approving" ? (
            <p role="status" className="type-small">
              {step.hash ? "Waiting for Ethereum to confirm the approval…" : "Waiting for your wallet. Approve the request there."}
            </p>
          ) : null}
        </div>
      ) : null}

      {step.k === "ready" || step.k === "signing" || step.k === "pending" ? (
        <>
          <EvmSummary chain={chain} pair={pair} issuer={issuer} p={step.p} slippageBps={slippageBps} amountRaw={amountRaw} />
          {step.k === "signing" ? (
            <p role="status" className="type-small">
              Waiting for your wallet. Approve the request there.
            </p>
          ) : null}
          {step.k === "pending" ? (
            <p role="status" className="type-small">
              Sent. Waiting for Ethereum to confirm…{" "}
              <a href={explorerUrl(chain.explorerTx, step.hash)} target="_blank" rel="noopener noreferrer">
                Watch it in the explorer
              </a>
            </p>
          ) : null}
        </>
      ) : null}

      {step.k === "done" ? (
        <div className={styles.receipt}>
          <div className={styles.celebrate}>
            <Ripple playKey={celebrate} />
            <p className="type-h3">Confirmed on Ethereum</p>
          </div>
          <dl className={styles.rows}>
            <Row label="You paid" value={`${rawToDecimalString(amountRaw, pair.inDecimals, 6)} ${pair.inSymbol}`} />
            <Row label="You received" value={step.received !== undefined ? `${rawToDecimalString(step.received, pair.outDecimals, 6)} ${pair.outSymbol}` : "See your wallet for the exact amount"} />
          </dl>
          <p className="type-small">
            <a href={explorerUrl(chain.explorerTx, step.hash)} target="_blank" rel="noopener noreferrer">
              Check it yourself in the explorer
            </a>
            . It is also in your session history on the <Link href="/portfolio">portfolio</Link> page.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

function EvmSummary({ chain, pair, issuer, p, slippageBps, amountRaw }: { chain: EvmChain; pair: Pair; issuer: Issuer; p: Prepared; slippageBps: number; amountRaw: bigint }) {
  const inUi = Number(amountRaw) / 10 ** pair.inDecimals;
  const outUi = Number(p.quote.amountOut) / 10 ** pair.outDecimals;
  const minUi = Number(p.minOut) / 10 ** pair.outDecimals;
  const fee = p.gas * p.gasPrice;
  return (
    <div className={styles.summary}>
      <dl className={styles.rows}>
        <Row label="You pay" value={`${formatNumber(inUi, 6)} ${pair.inSymbol}`} strong />
        <Row label="You receive about" value={`${formatNumber(outUi, 6)} ${pair.outSymbol}`} strong />
        <Row label="You receive at least" value={`${formatNumber(minUi, 6)} ${pair.outSymbol}`} hint={`If the price moves more than your ${(slippageBps / 100).toFixed(2)}% tolerance, the swap is cancelled instead of filling at a worse price.`} />
        <Row label="Route" value={`Uniswap v3, ${tierLabel(p.quote.fee)}`} hint="A single pool. Afterbell tries the standard fee tiers and picks the one that pays the most." />
        <Row label="Price impact" value="Not available" hint="Uniswap's quoter does not report a market reference price. The depth meter on this page shows how the price moves with order size." />
        <Row label="Slippage tolerance" value={`${(slippageBps / 100).toFixed(2)}%`} />
        <Row label="Afterbell fee" value="0 bps" hint="Afterbell does not charge a fee on Ethereum swaps." />
        <Row label="Network fee" value={`about ${formatWei(fee)} ${chain.nativeSymbol}`} hint="Estimated from the simulation and the current gas price. Paid in ETH to Ethereum validators, not to Afterbell or Uniswap. The final fee can differ." />
      </dl>
      <p className="type-small">The pre-check (simulation) passed. That does not guarantee the outcome: prices can still move before the swap lands.</p>
      {issuer.restrictsUsPersons ? (
        <p className="type-small">
          Issuer limit: <RestrictionText issuer={issuer} />
        </p>
      ) : null}
      <p className="type-note">Swaps cannot be undone once confirmed.</p>
    </div>
  );
}
