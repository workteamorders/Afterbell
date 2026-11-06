import { z } from "zod";
import { deriveAta } from "./ata";
import { activeMultiplier, uiAmount, type ScaledConfig } from "./amounts";
import { getBalance, getMultipleAccounts, type RpcOptions } from "./rpc";
import type { Token } from "./registry";

/**
 * Portofolio: saldo dibaca dari ATA turunan untuk setiap mint di registry, memakai getMultipleAccounts.
 * Tidak memakai getTokenAccountsByOwner atau getProgramAccounts (sering diblokir penyedia RPC gratis).
 * Catatan: hanya ATA yang terbaca. Token yang dipegang di akun token non-ATA tidak tampil; dijelaskan di /help.
 */
export interface Holding {
  token: Token;
  ata: string;
  /** Saldo mentah. */
  raw: bigint;
  multiplier: number;
  /** Saldo tampil (sudah dikalikan multiplier). */
  ui: number;
  hasAccount: boolean;
}

export interface Portfolio {
  owner: string;
  lamports: number | null;
  holdings: Holding[];
}

const tokenAccountData = z.tuple([z.string(), z.literal("base64")]);
const mintData = z
  .object({
    parsed: z
      .object({
        info: z
          .object({
            extensions: z.array(z.object({ extension: z.string(), state: z.record(z.string(), z.unknown()).optional() }).loose()).optional(),
          })
          .loose(),
      })
      .loose(),
  })
  .loose();

/** Saldo token ada pada offset 64, 8 byte little-endian (tata letak akun token Token dan Token-2022). */
export function decodeTokenAmount(base64: string): bigint {
  const bin = atob(base64);
  if (bin.length < 8) return 0n;
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bin.charCodeAt(i));
  return v;
}

export function scaledConfigFromMint(data: unknown): ScaledConfig | undefined {
  const parsed = mintData.safeParse(data);
  if (!parsed.success) return undefined;
  const ext = parsed.data.parsed.info.extensions?.find((e) => e.extension === "scaledUiAmountConfig");
  const s = ext?.state;
  if (!s) return undefined;
  const num = (v: unknown): number | undefined => {
    const n = typeof v === "string" || typeof v === "number" ? Number(v) : Number.NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const multiplier = num(s.multiplier);
  if (multiplier === undefined) return undefined;
  return { multiplier, newMultiplier: num(s.newMultiplier), effectiveTimestamp: num(s.newMultiplierEffectiveTimestamp) };
}

export async function loadPortfolio(owner: string, tokens: readonly Token[], opts?: RpcOptions & { nowSec?: number }): Promise<Portfolio> {
  const nowSec = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  const atas = await Promise.all(tokens.map((t) => deriveAta(owner, t.mint, t.tokenProgram)));

  const [accounts, mints, lamports] = await Promise.all([
    getMultipleAccounts(atas, { encoding: "base64", dataSlice: { offset: 64, length: 8 } }, opts),
    getMultipleAccounts(
      tokens.map((t) => t.mint),
      { encoding: "jsonParsed" },
      opts,
    ),
    getBalance(owner, opts).catch(() => null),
  ]);

  const holdings: Holding[] = tokens.map((token, i) => {
    const acct = accounts[i] ?? null;
    let raw = 0n;
    if (acct) {
      const d = tokenAccountData.safeParse(acct.data);
      if (d.success) raw = decodeTokenAmount(d.data[0]);
    }
    const multiplier = activeMultiplier(scaledConfigFromMint(mints[i]?.data), nowSec);
    return { token, ata: atas[i] ?? "", raw, multiplier, ui: uiAmount(raw, token.decimals, multiplier), hasAccount: acct !== null };
  });
  return { owner, lamports, holdings };
}

export interface Balances {
  lamports: number | null;
  usdcRaw: bigint;
  tokenRaw: bigint;
  tokenMultiplier: number;
}

/** Saldo untuk panel swap: USDC, token, dan SOL (untuk biaya jaringan). Semuanya lewat getMultipleAccounts dan getBalance. */
export async function loadBalances(owner: string, token: Token, usdc: { mint: string; program: "token" | "token-2022" }, opts?: RpcOptions & { nowSec?: number }): Promise<Balances> {
  const nowSec = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  const [usdcAta, tokenAta] = await Promise.all([deriveAta(owner, usdc.mint, usdc.program), deriveAta(owner, token.mint, token.tokenProgram)]);
  const [accounts, mints, lamports] = await Promise.all([
    getMultipleAccounts([usdcAta, tokenAta], { encoding: "base64", dataSlice: { offset: 64, length: 8 } }, opts),
    getMultipleAccounts([token.mint], { encoding: "jsonParsed" }, opts),
    getBalance(owner, opts).catch(() => null),
  ]);
  const amount = (a: RawAccountLike | null | undefined): bigint => {
    if (!a) return 0n;
    const d = tokenAccountData.safeParse(a.data);
    return d.success ? decodeTokenAmount(d.data[0]) : 0n;
  };
  return {
    lamports,
    usdcRaw: amount(accounts[0]),
    tokenRaw: amount(accounts[1]),
    tokenMultiplier: activeMultiplier(scaledConfigFromMint(mints[0]?.data), nowSec),
  };
}

type RawAccountLike = { data?: unknown };
