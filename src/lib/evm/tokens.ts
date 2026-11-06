import { decodeFunctionResult, encodeFunctionData } from "viem";
import { CoalescingCache } from "../limiter";
import type { RpcOptions } from "../rpc";
import { erc20Abi } from "./abi";
import type { EvmChain } from "./chains";
import { ethCall } from "./rpc";

/** Decimals dibaca on-chain (dokumen xStocks tidak menyebutnya). Hasil disimpan; nilainya tidak berubah untuk sebuah kontrak. */
const decimalsCache = new Map<string, number>();
const inflight = new CoalescingCache<number>(3_600_000);

export async function readDecimals(chain: EvmChain, token: string, o?: RpcOptions): Promise<number> {
  const k = `${chain.id}:${token.toLowerCase()}`;
  const known = decimalsCache.get(k);
  if (known !== undefined) return known;
  if (token.toLowerCase() === chain.usdc.address.toLowerCase()) return chain.usdc.decimals;
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
