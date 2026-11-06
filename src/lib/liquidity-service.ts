import { jupiter, JupiterError, type JupiterClient } from "./jupiter";
import { computeLiquidity, NOTIONALS_USD, type LiquidityResult } from "./liquidity";
import type { Token } from "./registry";
import { USDC_DECIMALS, USDC_MINT } from "./solana/programs";

/**
 * Menjalankan tiga kuotasi beli (USDC ke token) pada $100, $1.000, $10.000 untuk satu token.
 * Hasil terakhir disimpan di memori agar daftar Jelajah bisa menampilkan nilai cache tanpa menambah beban
 * pada batas laju (D-006). Kuotasi tanpa taker tidak mengandung transaksi.
 */
export type LiquidityState =
  | { state: "ready"; result: LiquidityResult; at: number }
  | { state: "unavailable"; reason: string; retryAfterMs?: number };

const memory = new Map<string, Extract<LiquidityState, { state: "ready" }>>();

export function cachedLiquidity(symbol: string): Extract<LiquidityState, { state: "ready" }> | undefined {
  return memory.get(symbol);
}

export async function loadLiquidity(token: Token, client: JupiterClient = jupiter(), signal?: AbortSignal): Promise<LiquidityState> {
  try {
    const orders = await Promise.all(
      NOTIONALS_USD.map((usd) =>
        client.quote({ inputMint: USDC_MINT, outputMint: token.mint, amount: BigInt(usd) * 10n ** BigInt(USDC_DECIMALS) }, signal),
      ),
    );
    const sized = orders.map((o, i) => ({ notionalUsd: NOTIONALS_USD[i] ?? 0, inAmount: BigInt(o.inAmount), outAmount: BigInt(o.outAmount), router: o.router }));
    const [a, b, c] = sized;
    if (!a || !b || !c) return { state: "unavailable", reason: "Quotes were incomplete." };
    const result = computeLiquidity([a, b, c], USDC_DECIMALS, token.decimals);
    if (!result) return { state: "unavailable", reason: "Jupiter returned an empty quote." };
    const ready = { state: "ready" as const, result, at: Date.now() };
    memory.set(token.symbol, ready);
    return ready;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    if (e instanceof JupiterError) return { state: "unavailable", reason: e.message, retryAfterMs: e.retryAfterMs };
    return { state: "unavailable", reason: "Could not load quotes." };
  }
}
