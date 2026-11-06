"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGeo, useMarket, useWallet } from "@/components/providers/AppProviders";
import { Ripple } from "@/components/brand/Ripple";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CheckboxField, SliderField, TextField } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState, Notice } from "@/components/ui/StateBlock";
import { InfoTip } from "@/components/ui/Tooltip";
import { WalletPicker } from "@/components/wallet/WalletButton";
import { RestrictionText } from "@/components/token/RightsPanel";
import { activeMultiplier, formatNumber, parseDecimalToRaw, rawToDecimalString, uiAmount } from "@/lib/amounts";
import { CONFIG } from "@/lib/config";
import { resolveFeeDisplay, type FeeDisplay } from "@/lib/fees";
import { canTrade } from "@/lib/geo";
import { addHistory } from "@/lib/history";
import { JupiterError, jupiter, type Order } from "@/lib/jupiter";
import { routeLabel } from "@/lib/liquidity";
import { loadBalances, type Balances } from "@/lib/portfolio";
import type { Issuer, Token } from "@/lib/registry";
import { deriveAta } from "@/lib/ata";
import { getMultipleAccounts, simulateTransaction, getSignatureStatuses, RpcError } from "@/lib/rpc";
import { KEYS, readLocal, writeLocal } from "@/lib/storage";
import { USDC_DECIMALS, USDC_MINT } from "@/lib/solana/programs";
import {
  base64ToBytes,
  bytesToBase64,
  explainSimulationError,
  explorerUrl,
  firstSignature,
  lamportsToSol,
  networkFee,
  orderProblem,
  type FriendlyError,
} from "@/lib/swap";
import styles from "./SwapPanel.module.css";

type Side = "buy" | "sell";
const DEFAULT_SLIPPAGE_BPS = 50;
const ORDER_MAX_AGE_MS = 30_000;

interface Pair {
  side: Side;
  inMint: string;
  inDecimals: number;
  inSymbol: string;
  outMint: string;
  outDecimals: number;
  outSymbol: string;
}

function pairFor(token: Token, side: Side): Pair {
  return side === "buy"
    ? { side, inMint: USDC_MINT, inDecimals: USDC_DECIMALS, inSymbol: "USDC", outMint: token.mint, outDecimals: token.decimals, outSymbol: token.symbol }
    : { side, inMint: token.mint, inDecimals: token.decimals, inSymbol: token.symbol, outMint: USDC_MINT, outDecimals: USDC_DECIMALS, outSymbol: "USDC" };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/* ---------------- Panel ---------------- */
export function SwapPanel({ token, issuer }: { token: Token; issuer: Issuer }) {
  const geo = useGeo();
  const wallet = useWallet();
  const market = useMarket();

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_BPS);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [indicative, setIndicative] = useState<{ state: "idle" } | { state: "loading" } | { state: "ok"; out: bigint } | { state: "error"; message: string }>({ state: "idle" });
  const [picker, setPicker] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [review, setReview] = useState(false);

  const pair = useMemo(() => pairFor(token, side), [token, side]);
  const raw = useMemo(() => parseDecimalToRaw(amount, pair.inDecimals), [amount, pair.inDecimals]);

  useEffect(() => {
    const saved = Number(readLocal(KEYS.slippage));
    if (Number.isFinite(saved) && saved >= 10 && saved <= 300) setSlippage(saved);
  }, []);

  /* Saldo */
  const address = wallet.address;
  const loadBal = useCallback(() => {
    if (!address) return;
    setBalanceError(false);
    loadBalances(address, token, { mint: USDC_MINT, program: "token" })
      .then(setBalances)
      .catch(() => setBalanceError(true));
  }, [address, token]);
  useEffect(() => {
    setBalances(null);
    loadBal();
  }, [loadBal]);

  const balanceRaw = balances ? (side === "buy" ? balances.usdcRaw : balances.tokenRaw) : null;
  const balanceUi = balances && balanceRaw !== null ? (side === "buy" ? uiAmount(balanceRaw, USDC_DECIMALS) : uiAmount(balanceRaw, token.decimals, balances.tokenMultiplier)) : null;

  /* Validasi saat blur */
  const error = useMemo(() => {
    if (!touched) return undefined;
    if (amount.trim() === "") return "Enter an amount to continue";
    if (raw === null) return `Use numbers only, with up to ${pair.inDecimals} decimal places`;
    if (raw <= 0n) return "Amount must be more than 0 and no more than your balance";
    if (balanceRaw !== null && raw > balanceRaw) return "Amount must be more than 0 and no more than your balance";
    return undefined;
  }, [touched, amount, raw, balanceRaw, pair.inDecimals]);

  /* Kuotasi indikatif (tanpa taker). */
  const debouncedRaw = useDebounced(raw, 450);
  useEffect(() => {
    if (!debouncedRaw || debouncedRaw <= 0n) {
      setIndicative({ state: "idle" });
      return;
    }
    const c = new AbortController();
    setIndicative({ state: "loading" });
    jupiter()
      .quote({ inputMint: pair.inMint, outputMint: pair.outMint, amount: debouncedRaw }, c.signal)
      .then((o) => !c.signal.aborted && setIndicative({ state: "ok", out: BigInt(o.outAmount) }))
      .catch((e: unknown) => {
        if (c.signal.aborted) return;
        setIndicative({ state: "error", message: e instanceof JupiterError ? e.message : "Could not get a price." });
      });
    return () => c.abort();
  }, [debouncedRaw, pair.inMint, pair.outMint]);

  const onReview = () => {
    setTouched(true);
    if (raw === null || raw <= 0n || (balanceRaw !== null && raw > balanceRaw)) return;
    if (readLocal(KEYS.riskAck) !== "1") setRiskOpen(true);
    else setReview(true);
  };

  const tradable = canTrade(geo);
  const restricted = issuer.restrictsUsPersons;

  /* Wilayah belum diketahui: tidak ada tombol beli/jual sampai terkonfirmasi (gagal-tertutup).
     Pembatasan penerbit tidak bergantung pada wilayah, jadi tampil segera. */
  if (geo === undefined) {
    return (
      <Panel as="section" aria-label="Swap" aria-busy="true" className={`${styles.panel} ${styles.loadingPanel}`}>
        <Skeleton shape="title" />
        {restricted ? (
          <Notice tone="warning" icon="alert" title={`Check ${issuer.name}'s regional limits first`}>
            <RestrictionText issuer={issuer} />
          </Notice>
        ) : null}
        <Skeleton shape="block" />
        <Skeleton shape="pill" />
      </Panel>
    );
  }

  /* Mode lihat-saja: tanpa tombol beli/jual dan tanpa formulir. */
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

  return (
    <Panel as="section" aria-labelledby="swap-h" className={styles.panel}>
      <div className={styles.head}>
        <h2 id="swap-h" className="type-h3">
          {side === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
        </h2>
        <div className={styles.sides} role="group" aria-label="Direction">
          <Chip pressed={side === "buy"} onPressedChange={() => { setSide("buy"); setAmount(""); setTouched(false); }}>
            Buy
          </Chip>
          <Chip pressed={side === "sell"} onPressedChange={() => { setSide("sell"); setAmount(""); setTouched(false); }}>
            Sell
          </Chip>
        </div>
      </div>

      {restricted ? (
        <Notice tone="warning" icon="alert" title={`Check ${issuer.name}'s regional limits first`}>
          <RestrictionText issuer={issuer} />
        </Notice>
      ) : null}

      {market?.state === "closed" ? (
        <p className="type-note">US market is closed. The token price is set by on-chain demand and can differ from the stock price.</p>
      ) : null}

      <TextField
        label={side === "buy" ? "You pay" : "You sell"}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        suffix={pair.inSymbol}
        value={amount}
        error={error}
        help={balanceUi !== null ? `Balance: ${formatNumber(balanceUi, pair.inDecimals > 6 ? 6 : 4)} ${pair.inSymbol}` : wallet.status === "connected" ? (balanceError ? "Balance unavailable right now" : "Loading balance…") : "Connect a wallet to see your balance"}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => setTouched(true)}
      />
      {balanceUi !== null && balanceUi > 0 ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (balanceRaw !== null) {
                setAmount(rawToDecimalString(balanceRaw, pair.inDecimals));
                setTouched(true);
              }
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
        ) : indicative.state === "ok" ? (
          <p className={`type-num ${styles.receiveAmount}`}>
            {formatNumber(Number(indicative.out) / 10 ** pair.outDecimals, pair.outDecimals > 6 ? 6 : 4)} {pair.outSymbol}
          </p>
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
        {geo === undefined ? (
          <Skeleton shape="pill" />
        ) : !tradable ? (
          <Notice tone="info" icon="lock" title="View-only">
            {geo.kind === "blocked" ? "Buying and selling are not available in your region." : "Buying and selling stay off until your region is confirmed."}
          </Notice>
        ) : wallet.screened ? (
          <Notice tone="danger" icon="lock" title="This wallet cannot be used">
            This address is on Afterbell&apos;s blocked list, so swaps are switched off for it.
          </Notice>
        ) : wallet.status !== "connected" ? (
          <>
            <Button variant="primary" size="lg" icon="wallet" loading={wallet.status === "connecting"} onClick={() => setPicker(true)}>
              Connect wallet
            </Button>
            <WalletPicker open={picker} onClose={() => setPicker(false)} />
          </>
        ) : (
          <Button variant="primary" size="lg" icon="arrow-right" iconPosition="end" onClick={onReview}>
            {side === "buy" ? `Review buy of ${token.symbol}` : `Review sell of ${token.symbol}`}
          </Button>
        )}
        <p className="type-note">
          You see the full cost before you sign. Swaps are routed by Jupiter. <Link href="/methodology#fees">How fees work</Link>.
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
      {review && raw ? (
        <ReviewDialog
          token={token}
          issuer={issuer}
          pair={pair}
          amountRaw={raw}
          slippageBps={slippage}
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

/* ---------------- Pemberitahuan risiko (sekali) ---------------- */
export function RiskDialog({ open, onClose, onAccept }: { open: boolean; onClose: () => void; onAccept: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Before your first swap"
      description="Tokenized stocks carry risks that ordinary shares do not."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={onAccept}>
            Continue to review
          </Button>
        </>
      }
    >
      <ul className={styles.risks} role="list">
        <li>These tokens usually give price exposure, not ownership of the share or a vote. What you hold depends on the issuer.</li>
        <li>Liquidity can be thin. You may get a worse price than you expect, especially when the US market is closed.</li>
        <li>Swaps on Solana cannot be undone once confirmed.</li>
        <li>This is not investment advice, and Afterbell does not promise any return.</li>
      </ul>
      <p className="type-small">
        Read the full <Link href="/risk">risk notice</Link> and <Link href="/terms">terms</Link> (drafts awaiting legal review).
      </p>
      <CheckboxField label="I have read this and I understand" checked={ok} onChange={(e) => setOk(e.target.checked)} />
    </Dialog>
  );
}

/* ---------------- Ringkasan, simulasi, tanda tangan, bukti ---------------- */
type Step =
  | { k: "building" }
  | { k: "problem"; err: FriendlyError }
  | { k: "simulating"; order: Order; builtAt: number }
  | { k: "sim-failed"; order: Order; err: FriendlyError }
  | { k: "ready"; order: Order; builtAt: number }
  | { k: "signing"; order: Order }
  | { k: "sending"; order: Order; signature: string | null }
  | { k: "done"; order: Order; signature: string; out?: string; inAmt?: string }
  | { k: "failed"; err: FriendlyError; signature?: string | null };

function ReviewDialog({
  token,
  issuer,
  pair,
  amountRaw,
  slippageBps,
  onClose,
}: {
  token: Token;
  issuer: Issuer;
  pair: Pair;
  amountRaw: bigint;
  slippageBps: number;
  onClose: (done: boolean) => void;
}) {
  const wallet = useWallet();
  const taker = wallet.address ?? "";
  const [step, setStep] = useState<Step>({ k: "building" });
  const [feeInfo, setFeeInfo] = useState<{ refTokenAccountExists?: boolean }>({});
  const [celebrate, setCelebrate] = useState(0);
  const runId = useRef(0);

  const build = useCallback(async () => {
    const id = ++runId.current;
    setStep({ k: "building" });
    try {
      const order = await jupiter().orderForTaker({
        inputMint: pair.inMint,
        outputMint: pair.outMint,
        amount: amountRaw,
        taker,
        slippageBps,
        referralAccount: CONFIG.referralAccount,
        referralFee: CONFIG.referralAccount ? CONFIG.referralFeeBps : undefined,
      });
      if (id !== runId.current) return;
      const problem = orderProblem(order);
      if (problem) return setStep({ k: "problem", err: problem });

      /* Periksa referralTokenAccount untuk feeMint (hanya bisa menurunkan biaya menjadi 0). */
      let exists: boolean | undefined;
      if (CONFIG.referralAccount && order.feeMint) {
        try {
          const ata = await deriveAta(CONFIG.referralAccount, order.feeMint, "token");
          const [acct] = await getMultipleAccounts([ata], { encoding: "base64", dataSlice: { offset: 0, length: 0 } });
          exists = acct !== null && acct !== undefined;
        } catch {
          exists = undefined;
        }
      }
      if (id !== runId.current) return;
      setFeeInfo({ refTokenAccountExists: exists });

      const builtAt = Date.now();
      setStep({ k: "simulating", order, builtAt });
      const sim = await simulateTransaction(order.transaction ?? "");
      if (id !== runId.current) return;
      const err = explainSimulationError(sim);
      setStep(err ? { k: "sim-failed", order, err } : { k: "ready", order, builtAt });
    } catch (e) {
      if (id !== runId.current) return;
      if (e instanceof JupiterError) {
        setStep({
          k: "failed",
          err: {
            what: e.kind === "rate-limited" ? "Too many price requests were made in a short time." : e.kind === "network" ? "Afterbell could not reach Jupiter." : e.message,
            safety: "Nothing was sent from your wallet.",
            next: e.kind === "rate-limited" && e.retryAfterMs ? `Wait ${Math.ceil(e.retryAfterMs / 1000)} seconds, then try again.` : "Try again in a moment.",
          },
        });
      } else if (e instanceof RpcError) {
        setStep({ k: "failed", err: { what: `The pre-check could not run: ${e.message}`, safety: "Nothing was sent from your wallet.", next: "Try again in a moment." } });
      } else {
        setStep({ k: "failed", err: { what: "Something went wrong while preparing this swap.", safety: "Nothing was sent from your wallet.", next: "Try again." } });
      }
    }
  }, [pair.inMint, pair.outMint, amountRaw, taker, slippageBps]);

  useEffect(() => {
    void build();
    return () => {
      runId.current++;
    };
  }, [build]);

  const confirm = async (order: Order, builtAt: number) => {
    if (Date.now() - builtAt > ORDER_MAX_AGE_MS) {
      await build();
      return;
    }
    setStep({ k: "signing", order });
    let signed: Uint8Array;
    try {
      signed = await wallet.sign(base64ToBytes(order.transaction ?? ""));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setStep({
        k: "failed",
        err: {
          what: /reject|denied|cancel/i.test(msg) ? "You declined the request in your wallet." : "The wallet did not sign the transaction.",
          safety: "Nothing was sent. Your funds did not move.",
          next: "Review the swap again when you are ready.",
        },
      });
      return;
    }
    const sponsored = order.signatureFeePayer != null && order.signatureFeePayer !== taker;
    const derived = sponsored ? null : firstSignature(signed);
    setStep({ k: "sending", order, signature: derived });
    try {
      const res = await jupiter().execute(bytesToBase64(signed), order.requestId ?? "", order.lastValidBlockHeight);
      const sig = res.signature ?? derived;
      if (res.status === "Success" && sig) {
        addHistory({
          signature: sig,
          at: Date.now(),
          side: pair.side,
          symbol: token.symbol,
          inAmount: rawToDecimalString(amountRaw, pair.inDecimals, 6),
          inSymbol: pair.inSymbol,
          outAmount: res.totalOutputAmount ? rawToDecimalString(BigInt(res.totalOutputAmount), pair.outDecimals, 6) : "?",
          outSymbol: pair.outSymbol,
        });
        setCelebrate((n) => n + 1);
        setStep({
          k: "done",
          order,
          signature: sig,
          out: res.totalOutputAmount ? rawToDecimalString(BigInt(res.totalOutputAmount), pair.outDecimals, 6) : undefined,
          inAmt: res.totalInputAmount ? rawToDecimalString(BigInt(res.totalInputAmount), pair.inDecimals, 6) : undefined,
        });
      } else {
        setStep({
          k: "failed",
          signature: sig,
          err: {
            what: res.error ? `Jupiter reported: ${res.error}` : "The swap did not land on Solana.",
            safety: "A swap that did not land does not move your tokens. Confirm in your wallet history or the explorer before trying again.",
            next: "Review the swap again for a fresh quote.",
          },
        });
      }
    } catch {
      /* Hasil tidak diketahui: kirim mungkin berhasil. Periksa status sebelum menyatakan apa pun. */
      let landed = false;
      if (derived) {
        try {
          const [st] = await getSignatureStatuses([derived]);
          landed = !!st && st.err == null && !!st.confirmationStatus;
        } catch {
          landed = false;
        }
      }
      if (landed && derived) setStep({ k: "done", order, signature: derived });
      else {
        setStep({
          k: "failed",
          signature: derived,
          err: {
            what: "Afterbell lost contact with Jupiter while sending, so the result is unknown.",
            safety: "Your swap may or may not have gone through. Do not repeat it until you have checked.",
            next: derived ? "Open the explorer link below to see if it landed, or check your wallet history." : "Check your wallet history to see if it landed.",
          },
        });
      }
    }
  };

  const busy = step.k === "signing" || step.k === "sending";
  const done = step.k === "done";

  return (
    <Dialog
      open
      onClose={() => (busy ? undefined : onClose(done))}
      title={done ? "Swap confirmed" : pair.side === "buy" ? `Review: buy ${token.symbol}` : `Review: sell ${token.symbol}`}
      description={done ? "Your wallet signed it and Solana confirmed it." : "Check the full cost. Nothing is sent until you confirm in your wallet."}
      actions={
        <>
          {step.k === "ready" ? (
            <>
              <Button variant="ghost" onClick={() => onClose(false)}>
                Cancel
              </Button>
              <Button variant="primary" icon="wallet" onClick={() => void confirm(step.order, step.builtAt)}>
                Sign in wallet
              </Button>
            </>
          ) : step.k === "sim-failed" || step.k === "problem" || (step.k === "failed" && !step.signature) ? (
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
          )}
        </>
      }
    >
      {step.k === "building" || step.k === "simulating" ? (
        <div className={styles.working} aria-busy="true" role="status">
          <Skeleton shape="line" />
          <Skeleton shape="block" />
          <p className="type-small muted">{step.k === "building" ? "Getting a quote and building the transaction…" : "Checking the transaction with a simulation. Nothing is sent."}</p>
        </div>
      ) : null}

      {step.k === "problem" || step.k === "sim-failed" || step.k === "failed" ? (
        <>
          <ErrorState title={step.k === "sim-failed" ? "The pre-check failed" : "This swap cannot go ahead"} what={step.err.what} safety={step.err.safety} next={step.err.next} />
          {step.k === "failed" && step.signature ? (
            <p className="type-small">
              <a href={explorerUrl(CONFIG.explorerTxBase, step.signature)} target="_blank" rel="noopener noreferrer">
                Open this transaction in the explorer
              </a>
            </p>
          ) : null}
        </>
      ) : null}

      {step.k === "ready" || step.k === "signing" || step.k === "sending" ? (
        <>
          <Summary order={step.order} pair={pair} issuer={issuer} taker={taker} fee={resolveFeeDisplay(step.order, { referralAccount: CONFIG.referralAccount, requestedBps: CONFIG.referralFeeBps, referralTokenAccountExists: feeInfo.refTokenAccountExists })} token={token} />
          {step.k === "signing" ? <p role="status" className="type-small">Waiting for your wallet. Approve the request there.</p> : null}
          {step.k === "sending" ? <p role="status" className="type-small">Sending through Jupiter…</p> : null}
        </>
      ) : null}

      {step.k === "done" ? (
        <div className={styles.receipt}>
          <div className={styles.celebrate}>
            <Ripple playKey={celebrate} />
            <p className="type-h3">Confirmed on Solana</p>
          </div>
          <dl className={styles.rows}>
            <Row label="You paid" value={`${step.inAmt ?? rawToDecimalString(amountRaw, pair.inDecimals, 6)} ${pair.inSymbol}`} />
            <Row label="You received" value={step.out ? `${step.out} ${pair.outSymbol}` : "See your wallet for the exact amount"} />
          </dl>
          <p className="type-small">
            <a href={explorerUrl(CONFIG.explorerTxBase, step.signature)} target="_blank" rel="noopener noreferrer">
              Check it yourself in the explorer
            </a>
            . It is also in your session history on the <Link href="/portfolio">portfolio</Link> page.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

export function Row({ label, value, hint, strong }: { label: string; value: React.ReactNode; hint?: string; strong?: boolean }) {
  return (
    <div className={styles.row}>
      <dt>
        {label}
        {hint ? <InfoTip label={`About ${label.toLowerCase()}`}>{hint}</InfoTip> : null}
      </dt>
      <dd className={strong ? styles.strong : undefined}>{value}</dd>
    </div>
  );
}

function Summary({ order, pair, issuer, taker, fee, token }: { order: Order; pair: Pair; issuer: Issuer; taker: string; fee: FeeDisplay; token: Token }) {
  const net = networkFee(order, taker);
  const inUi = Number(order.inAmount) / 10 ** pair.inDecimals;
  const outUi = Number(order.outAmount) / 10 ** pair.outDecimals;
  const minOut = order.otherAmountThreshold ? Number(order.otherAmountThreshold) / 10 ** pair.outDecimals : undefined;
  const feeSymbol = fee.feeMint === USDC_MINT ? "USDC" : fee.feeMint === token.mint ? token.symbol : undefined;
  const feeDecimals = fee.feeMint === USDC_MINT ? USDC_DECIMALS : fee.feeMint === token.mint ? token.decimals : undefined;
  const feeAmount = fee.afterbellAmountRaw !== undefined && feeDecimals !== undefined ? rawToDecimalString(fee.afterbellAmountRaw, feeDecimals, 6) : undefined;
  const route = order.router ? routeLabel(order.router) : "Unknown";
  const steps = order.routePlan?.map((s) => s.swapInfo.label).filter(Boolean) ?? [];

  return (
    <div className={styles.summary}>
      <dl className={styles.rows}>
        <Row label="You pay" value={`${formatNumber(inUi, 6)} ${pair.inSymbol}`} strong />
        <Row label="You receive about" value={`${formatNumber(outUi, 6)} ${pair.outSymbol}`} strong />
        <Row
          label="You receive at least"
          value={minOut !== undefined ? `${formatNumber(minOut, 6)} ${pair.outSymbol}` : "Not stated"}
          hint={`If the price moves more than your ${(slippageText(order))} tolerance, the swap is cancelled instead of filling at a worse price.`}
        />
        <Row label="Route" value={steps.length ? `${route}: ${steps.join(", ")}` : route} />
        <Row label="Price impact (Jupiter estimate)" value={order.priceImpact !== undefined ? `${order.priceImpact.toFixed(2)}%` : "Not stated"} hint="Jupiter compares the quote with its own reference price. After US market hours that reference can be out of date." />
        <Row label="Slippage tolerance" value={slippageText(order)} />
        <Row
          label="Afterbell fee"
          value={fee.afterbellBps > 0 ? `${fee.afterbellBps} bps${feeAmount && feeSymbol ? `, ${fee.amountIsEstimate ? "about " : ""}${feeAmount} ${feeSymbol}` : ""}` : "0 bps"}
          hint={
            fee.status === "charged"
              ? "Confirmed by Jupiter's quote. Per Jupiter's published terms, Jupiter keeps 20% of this fee."
              : fee.status === "not-configured"
                ? "Afterbell is not charging a fee on this swap."
                : "Afterbell is not charging a fee on this swap, because Jupiter's quote did not apply it."
          }
        />
        {fee.jupiterBps > 0 ? <Row label="Jupiter platform fee" value={`${fee.jupiterBps} bps`} hint="Charged by Jupiter and paid to Jupiter. Afterbell does not receive it." /> : null}
        <Row
          label="Network fee"
          value={net.lamports > 0 ? `${lamportsToSol(net.lamports)} SOL${net.sponsored ? " (the signature fee is paid by another party)" : ""}` : net.sponsored ? "Paid by another party" : "Under 0.000001 SOL"}
          hint="Paid in SOL to Solana validators. It is not paid to Afterbell or Jupiter."
        />
      </dl>
      <p className="type-small">
        The pre-check (simulation) passed. That does not guarantee the outcome: prices can still move before the swap lands.
      </p>
      {issuer.restrictsUsPersons ? (
        <p className="type-small">
          Issuer limit: <RestrictionText issuer={issuer} />
        </p>
      ) : null}
      <p className="type-note">Powered by Jupiter. Swaps cannot be undone once confirmed.</p>
    </div>
  );
}

function slippageText(order: Order): string {
  return order.slippageBps !== undefined ? `${(order.slippageBps / 100).toFixed(2)}%` : "Automatic";
}

void activeMultiplier;
