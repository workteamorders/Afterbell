import { computeLiquidity, NOTIONALS_USD, type LiquidityResult } from "../liquidity";
import type { RpcOptions } from "../rpc";
import { RpcError } from "../rpc";
import type { EvmToken } from "../registry";
import type { EvmChain } from "./chains";
import { quoteExactInCached } from "./quote";
import { readDecimals } from "./tokens";

/**
 * Kedalaman likuiditas di EVM: kuotasi beli (USDC ke token) pada $100, $1.000, $10.000 lewat Uniswap v3 QuoterV2.
 * Metrik dan ambang sama dengan Solana (lihat /methodology). Bila kolam tidak bisa mengisi sebuah ukuran, itu fakta yang
 * ditampilkan apa adanya ("limited"), bukan angka karangan.
 */
export type EvmLiquidityState =
  | { state: "ready"; result: LiquidityResult; at: number; fees: number[] }
  | { state: "limited"; filledUsd: number[]; unfilledUsd: number[]; at: number }
  | { state: "unavailable"; reason: string };

const memory = new Map<string, Extract<EvmLiquidityState, { state: "ready" | "limited" }>>();
const key = (t: EvmToken) => `${t.chain}:${t.symbol}`;

export function cachedEvmLiquidity(token: EvmToken) {
  return memory.get(key(token));
}

export async function loadEvmLiquidity(chain: EvmChain, token: EvmToken, o?: RpcOptions): Promise<EvmLiquidityState> {
  try {
    const decimals = await readDecimals(chain, token.address, o);
    const usdc = BigInt(10) ** BigInt(chain.usdc.decimals);
    // Tingkat biaya diketahui dari kuotasi $100: hanya tingkat yang punya kolam dicoba untuk ukuran lebih besar.
    const probe = await Promise.all(
      chain.feeTiers.map((fee) =>
        quoteExactInCached(chain, chain.usdc.address, token.address, BigInt(NOTIONALS_USD[0]) * usdc, [fee], o).then((q) => (q ? fee : null)),
      ),
    );
    const live = probe.filter((f): f is number => f !== null);
    const at = Date.now();
    if (live.length === 0) {
      const limited = { state: "limited" as const, filledUsd: [], unfilledUsd: [...NOTIONALS_USD], at };
      memory.set(key(token), limited);
      return limited;
    }
    const quotes = await Promise.all(NOTIONALS_USD.map((n) => quoteExactInCached(chain, chain.usdc.address, token.address, BigInt(n) * usdc, live, o)));
    const filled = NOTIONALS_USD.filter((_, i) => quotes[i]);
    const unfilled = NOTIONALS_USD.filter((_, i) => !quotes[i]);
    if (unfilled.length > 0) {
      const limited = { state: "limited" as const, filledUsd: [...filled], unfilledUsd: [...unfilled], at };
      memory.set(key(token), limited);
      return limited;
    }
    const sized = NOTIONALS_USD.map((n, i) => ({ notionalUsd: n, inAmount: BigInt(n) * usdc, outAmount: quotes[i]?.amountOut ?? 0n, router: "uniswap-v3" }));
    const [a, b, c] = sized;
    if (!a || !b || !c) return { state: "unavailable", reason: "Quotes were incomplete." };
    const result = computeLiquidity([a, b, c], chain.usdc.decimals, decimals);
    if (!result) return { state: "unavailable", reason: "The pool returned an empty quote." };
    const ready = { state: "ready" as const, result: { ...result, route: "Uniswap v3" }, at, fees: live };
    memory.set(key(token), ready);
    return ready;
  } catch (e) {
    if (e instanceof RpcError) return { state: "unavailable", reason: e.message };
    return { state: "unavailable", reason: "Could not load quotes." };
  }
}

