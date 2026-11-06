import { decodeFunctionResult, encodeFunctionData } from "viem";
import { CoalescingCache } from "../limiter";
import type { RpcOptions } from "../rpc";
import { quoterV2Abi } from "./abi";
import type { EvmChain } from "./chains";
import { ethCall, isRevert } from "./rpc";

export interface EvmQuote {
  fee: number;
  amountOut: bigint;
  /** Perkiraan gas dari QuoterV2 (bukan batas gas transaksi). */
  gasEstimate: bigint;
}

/** Kuotasi satu tingkat biaya. null bila kolam tidak ada atau tidak bisa mengisi jumlah itu. */
async function quoteTier(chain: EvmChain, tokenIn: string, tokenOut: string, amountIn: bigint, fee: number, o?: RpcOptions): Promise<EvmQuote | null> {
  const data = encodeFunctionData({
    abi: quoterV2Abi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: tokenIn as `0x${string}`, tokenOut: tokenOut as `0x${string}`, amountIn, fee, sqrtPriceLimitX96: 0n }],
  });
  try {
    const out = await ethCall(chain, { to: chain.uniswapV3.quoterV2, data }, o);
    const [amountOut, , , gasEstimate] = decodeFunctionResult({ abi: quoterV2Abi, functionName: "quoteExactInputSingle", data: out });
    return amountOut > 0n ? { fee, amountOut, gasEstimate } : null;
  } catch (e) {
    if (isRevert(e)) return null;
    throw e;
  }
}

/** Kuotasi terbaik di antara tingkat biaya yang dicoba. null bila tidak ada kolam yang bisa mengisi. */
export async function quoteExactIn(chain: EvmChain, tokenIn: string, tokenOut: string, amountIn: bigint, tiers: readonly number[] = chain.feeTiers, o?: RpcOptions): Promise<EvmQuote | null> {
  const all = await Promise.all(tiers.map((fee) => quoteTier(chain, tokenIn, tokenOut, amountIn, fee, o)));
  let best: EvmQuote | null = null;
  for (const q of all) if (q && (!best || q.amountOut > best.amountOut)) best = q;
  return best;
}

const cache = new CoalescingCache<EvmQuote | null>(10_000);

/** Versi ber-cache 10 detik dengan penggabungan permintaan sama. */
export function quoteExactInCached(chain: EvmChain, tokenIn: string, tokenOut: string, amountIn: bigint, tiers?: readonly number[], o?: RpcOptions): Promise<EvmQuote | null> {
  const key = `${chain.id}:${tokenIn}:${tokenOut}:${amountIn}:${(tiers ?? chain.feeTiers).join(",")}`;
  return cache.get(key, () => quoteExactIn(chain, tokenIn, tokenOut, amountIn, tiers, o));
}
