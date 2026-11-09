import { decodeFunctionResult, encodeFunctionData } from "viem";
import { CoalescingCache } from "../limiter";
import { EVM_TOKENS } from "../registry";
import type { RpcOptions } from "../rpc";
import { quoterV2Abi, stateViewAbi, v4QuoterAbi } from "./abi";
import type { EvmChain, EvmChainV3, EvmChainV4 } from "./chains";
import { ethCall, isRevert } from "./rpc";
import { candidatePools, isZeroForOne, poolId, type PoolKey } from "./v4";

export interface EvmQuote {
  /** Tingkat biaya kolam dalam hundredths of a bip (v3 dan v4 sama). */
  fee: number;
  amountOut: bigint;
  /** Perkiraan gas dari quoter (bukan batas gas transaksi). */
  gasEstimate: bigint;
  /** Hanya Uniswap v4: kolam yang dipakai. */
  pool?: PoolKey;
}

/* ---------------- Uniswap v3 ---------------- */

/** Kuotasi satu tingkat biaya. null bila kolam tidak ada atau tidak bisa mengisi jumlah itu. */
async function quoteTier(chain: EvmChainV3, tokenIn: string, tokenOut: string, amountIn: bigint, fee: number, o?: RpcOptions): Promise<EvmQuote | null> {
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

/* ---------------- Uniswap v4 ---------------- */

const liveCache = new CoalescingCache<boolean>(30_000);

/** Kolam dianggap hidup bila StateView melaporkan likuiditas aktif lebih dari nol. */
async function poolHasLiquidity(chain: EvmChainV4, key: PoolKey, o?: RpcOptions): Promise<boolean> {
  return liveCache.get(`${chain.id}:${poolId(key)}`, async () => {
    const data = encodeFunctionData({ abi: stateViewAbi, functionName: "getLiquidity", args: [poolId(key)] });
    const out = await ethCall(chain, { to: chain.uniswapV4.stateView, data }, o);
    return decodeFunctionResult({ abi: stateViewAbi, functionName: "getLiquidity", data: out }) > 0n;
  });
}

async function quotePool(chain: EvmChainV4, key: PoolKey, tokenIn: string, amountIn: bigint, o?: RpcOptions): Promise<EvmQuote | null> {
  if (amountIn > 2n ** 128n - 1n) return null;
  const data = encodeFunctionData({
    abi: v4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: { ...key }, zeroForOne: isZeroForOne(key, tokenIn), exactAmount: amountIn, hookData: "0x" }],
  });
  try {
    const out = await ethCall(chain, { to: chain.uniswapV4.quoter, data }, o);
    const [amountOut, gasEstimate] = decodeFunctionResult({ abi: v4QuoterAbi, functionName: "quoteExactInputSingle", data: out });
    return amountOut > 0n ? { fee: key.fee, amountOut, gasEstimate, pool: key } : null;
  } catch (e) {
    if (isRevert(e)) return null;
    throw e;
  }
}

function extraPoolsFor(chain: EvmChainV4, a: string, b: string) {
  const tokens = EVM_TOKENS.filter((t) => t.chain === chain.id && (t.address.toLowerCase() === a.toLowerCase() || t.address.toLowerCase() === b.toLowerCase()));
  return tokens.flatMap((t) => t.pools ?? []);
}

async function quoteV4(chain: EvmChainV4, tokenIn: string, tokenOut: string, amountIn: bigint, o?: RpcOptions): Promise<EvmQuote | null> {
  const candidates = candidatePools(chain, tokenIn, tokenOut, extraPoolsFor(chain, tokenIn, tokenOut));
  const live = (await Promise.all(candidates.map(async (k) => ((await poolHasLiquidity(chain, k, o)) ? k : null)))).filter((k): k is PoolKey => k !== null);
  const all = await Promise.all(live.map((k) => quotePool(chain, k, tokenIn, amountIn, o)));
  return best(all);
}

function best(all: Array<EvmQuote | null>): EvmQuote | null {
  let top: EvmQuote | null = null;
  for (const q of all) if (q && (!top || q.amountOut > top.amountOut)) top = q;
  return top;
}

/* ---------------- Gabungan ---------------- */

/**
 * Kuotasi terbaik di antara kolam yang dicoba. null bila tidak ada kolam yang bisa mengisi.
 * `tiers` hanya berlaku untuk Uniswap v3; v4 mencari kolam sendiri (grid standar tanpa hook + kolam manual di registry).
 */
export async function quoteExactIn(chain: EvmChain, tokenIn: string, tokenOut: string, amountIn: bigint, tiers?: readonly number[], o?: RpcOptions): Promise<EvmQuote | null> {
  if (chain.venue === "uniswap-v4") return quoteV4(chain, tokenIn, tokenOut, amountIn, o);
  const use = tiers ?? chain.feeTiers;
  return best(await Promise.all(use.map((fee) => quoteTier(chain, tokenIn, tokenOut, amountIn, fee, o))));
}

const cache = new CoalescingCache<EvmQuote | null>(10_000);

/** Versi ber-cache 10 detik dengan penggabungan permintaan sama. */
export function quoteExactInCached(chain: EvmChain, tokenIn: string, tokenOut: string, amountIn: bigint, tiers?: readonly number[], o?: RpcOptions): Promise<EvmQuote | null> {
  const tierKey = chain.venue === "uniswap-v3" ? (tiers ?? chain.feeTiers).join(",") : "v4";
  const key = `${chain.id}:${tokenIn}:${tokenOut}:${amountIn}:${tierKey}`;
  return cache.get(key, () => quoteExactIn(chain, tokenIn, tokenOut, amountIn, tiers, o));
}
