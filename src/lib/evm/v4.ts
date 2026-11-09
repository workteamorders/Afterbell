import { encodeAbiParameters, keccak256 } from "viem";
import type { EvmPoolEntry } from "../registry/evm-schema";
import type { EvmChainV4 } from "./chains";

/** Kunci kolam Uniswap v4. currency0 < currency1 (nilai numerik); hooks = alamat nol berarti kolam tanpa hook. */
export interface PoolKey {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
}

export const NO_HOOKS = "0x0000000000000000000000000000000000000000" as const;

const POOL_KEY_PARAMS = [
  { type: "address" },
  { type: "address" },
  { type: "uint24" },
  { type: "int24" },
  { type: "address" },
] as const;

/** Urutan currency sesuai aturan v4: alamat numerik lebih kecil jadi currency0. */
export function sortCurrencies(a: string, b: string): [`0x${string}`, `0x${string}`] {
  const [x, y] = [a as `0x${string}`, b as `0x${string}`];
  return BigInt(x) < BigInt(y) ? [x, y] : [y, x];
}

/** PoolId = keccak256(abi.encode(PoolKey)), sama dengan PoolIdLibrary.toId di v4-core. */
export function poolId(key: PoolKey): `0x${string}` {
  return keccak256(encodeAbiParameters(POOL_KEY_PARAMS, [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
}

export function isZeroForOne(key: PoolKey, tokenIn: string): boolean {
  return key.currency0.toLowerCase() === tokenIn.toLowerCase();
}

/** Kolam yang DICOBA untuk sepasang token: grid standar tanpa hook, ditambah kolam manual dari registry untuk pasangan yang sama. */
export function candidatePools(chain: EvmChainV4, tokenA: string, tokenB: string, extra: readonly EvmPoolEntry[] = []): PoolKey[] {
  const [c0, c1] = sortCurrencies(tokenA, tokenB);
  const out: PoolKey[] = chain.poolGrid.map((g) => ({ currency0: c0, currency1: c1, fee: g.fee, tickSpacing: g.tickSpacing, hooks: NO_HOOKS }));
  for (const p of extra) {
    if (p.currency0.toLowerCase() !== c0.toLowerCase() || p.currency1.toLowerCase() !== c1.toLowerCase()) continue;
    const key: PoolKey = { currency0: c0, currency1: c1, fee: p.fee, tickSpacing: p.tickSpacing, hooks: p.hooks as `0x${string}` };
    if (!out.some((o) => poolId(o) === poolId(key))) out.push(key);
  }
  return out;
}

export function poolLabel(key: PoolKey): string {
  const pct = `${(key.fee / 10_000).toFixed(2)}% fee`;
  return key.hooks.toLowerCase() === NO_HOOKS ? `${pct} pool` : `${pct} pool with a hook`;
}
