import { z } from "zod";
import { CONFIG } from "../config";
import { rpcCall, RpcError, type RpcOptions } from "../rpc";
import type { EvmChain } from "./chains";

/** Klien JSON-RPC EVM lewat relay /api/rpc?chain=... (allowlist di sisi function). Hanya baca dan persiapan transaksi. */
const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

function opts(chain: EvmChain, o?: RpcOptions): RpcOptions {
  return { ...o, path: o?.path ?? `${CONFIG.rpcPath}?chain=${chain.id}` };
}

export interface CallObject {
  to: string;
  data?: string;
  from?: string;
  value?: string;
}

export function ethCall(chain: EvmChain, call: CallObject, o?: RpcOptions): Promise<`0x${string}`> {
  return rpcCall("eth_call", [call, "latest"], hex, opts(chain, o)) as Promise<`0x${string}`>;
}

export async function ethGetBalance(chain: EvmChain, address: string, o?: RpcOptions): Promise<bigint> {
  return BigInt(await rpcCall("eth_getBalance", [address, "latest"], hex, opts(chain, o)));
}

export async function ethEstimateGas(chain: EvmChain, call: CallObject, o?: RpcOptions): Promise<bigint> {
  return BigInt(await rpcCall("eth_estimateGas", [call], hex, opts(chain, o)));
}

export async function ethGasPrice(chain: EvmChain, o?: RpcOptions): Promise<bigint> {
  return BigInt(await rpcCall("eth_gasPrice", [], hex, opts(chain, o)));
}

export async function ethChainId(chain: EvmChain, o?: RpcOptions): Promise<number> {
  return Number(BigInt(await rpcCall("eth_chainId", [], hex, opts(chain, o))));
}

const receiptSchema = z
  .object({
    status: hex.optional(),
    blockNumber: hex.optional(),
    gasUsed: hex.optional(),
    effectiveGasPrice: hex.optional(),
    logs: z.array(z.object({ address: z.string(), topics: z.array(z.string()), data: z.string() }).loose()).default([]),
  })
  .loose();
export type EvmReceipt = z.infer<typeof receiptSchema>;

export function ethGetReceipt(chain: EvmChain, txHash: string, o?: RpcOptions): Promise<EvmReceipt | null> {
  if (!hash32.safeParse(txHash).success) return Promise.reject(new RpcError("Not a transaction hash.", "bad-response"));
  return rpcCall("eth_getTransactionReceipt", [txHash], receiptSchema.nullable(), opts(chain, o));
}

/** Galat "execution reverted" dari eth_call berarti kontrak menolak (mis. tidak ada kolam), bukan gangguan jaringan. */
export function isRevert(e: unknown): boolean {
  return e instanceof RpcError && e.kind === "rpc" && /revert|execution|invalid opcode|out of gas|insufficient|STF|SPL|TF/i.test(e.message);
}
