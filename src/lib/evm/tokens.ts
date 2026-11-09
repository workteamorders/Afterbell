import { decodeFunctionResult, encodeFunctionData } from "viem";
import { CoalescingCache } from "../limiter";
import type { RpcOptions } from "../rpc";
import { erc20Abi, permit2Abi } from "./abi";
import type { EvmChain, EvmChainV4 } from "./chains";
import { ethCall } from "./rpc";

/** Decimals dibaca on-chain (dokumen xStocks tidak menyebutnya). Hasil disimpan; nilainya tidak berubah untuk sebuah kontrak. */
const decimalsCache = new Map<string, number>();
const inflight = new CoalescingCache<number>(3_600_000);

export async function readDecimals(chain: EvmChain, token: string, o?: RpcOptions): Promise<number> {
  const k = `${chain.id}:${token.toLowerCase()}`;
  const known = decimalsCache.get(k);
  if (known !== undefined) return known;
  if (chain.usd.decimalsVerified && token.toLowerCase() === chain.usd.address.toLowerCase()) return chain.usd.decimals;
  return inflight.get(k, async () => {
    const out = await ethCall(chain, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }) }, o);
    const d = decodeFunctionResult({ abi: erc20Abi, functionName: "decimals", data: out });
    decimalsCache.set(k, d);
    return d;
  });
}

export async function readErc20Balance(chain: EvmChain, token: string, owner: string, o?: RpcOptions): Promise<bigint> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner as `0x${string}`] });
  return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: await ethCall(chain, { to: token, data }, o) });
}

export async function readAllowance(chain: EvmChain, token: string, owner: string, spender: string, o?: RpcOptions): Promise<bigint> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [owner as `0x${string}`, spender as `0x${string}`] });
  return decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: await ethCall(chain, { to: token, data }, o) });
}

/**
 * Decimals aset dolar yang tidak tertulis di sumber resmi dibaca dari kontrak dan HARUS sama dengan konfigurasi.
 * Bila berbeda, semua jumlah akan salah skala, jadi pemanggil menghentikan kuotasi dan swap.
 */
const quoteChecked = new Map<string, Promise<void>>();
export function verifyQuoteDecimals(chain: EvmChain, o?: RpcOptions): Promise<void> {
  if (chain.usd.decimalsVerified) return Promise.resolve();
  const k = `${chain.id}:${chain.usd.address.toLowerCase()}`;
  let p = quoteChecked.get(k);
  if (!p) {
    p = readDecimals(chain, chain.usd.address, o).then((d) => {
      if (d !== chain.usd.decimals) throw new Error(`${chain.usd.symbol} reports ${d} decimals on ${chain.name}, not ${chain.usd.decimals}.`);
    });
    p.catch(() => quoteChecked.delete(k));
    quoteChecked.set(k, p);
  }
  return p;
}

/** Izin Permit2 untuk (owner, token, spender): jumlah dan waktu kedaluwarsa (detik epoch). */
export async function readPermit2Allowance(chain: EvmChainV4, token: string, owner: string, spender: string, o?: RpcOptions): Promise<{ amount: bigint; expiration: number }> {
  const data = encodeFunctionData({ abi: permit2Abi, functionName: "allowance", args: [owner as `0x${string}`, token as `0x${string}`, spender as `0x${string}`] });
  const [amount, expiration] = decodeFunctionResult({ abi: permit2Abi, functionName: "allowance", data: await ethCall(chain, { to: chain.uniswapV4.permit2, data }, o) });
  return { amount, expiration: Number(expiration) };
}
