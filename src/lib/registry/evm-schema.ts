import { z } from "zod";

/** Alamat EVM 0x + 40 hex. Checksum EIP-55 diperiksa di tests/evm.test.ts dan scripts/registry-check.ts. */
export const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Not a 0x EVM address");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const source = z.object({ label: z.string().min(1), url: z.url({ protocol: /^https$/ }) }).strict();

export const EVM_CHAIN_IDS = ["ethereum", "robinhood"] as const;

/**
 * Kolam Uniswap v4 yang ditambahkan manual (mis. kolam dengan hook yang tidak ditemukan oleh pencarian standar).
 * Kunci kolam harus berasal dari peristiwa Initialize PoolManager atau StateView; `source` menyebut asalnya.
 */
export const evmPoolSchema = z
  .object({
    currency0: evmAddress,
    currency1: evmAddress,
    fee: z.number().int().min(0).max(1_000_000),
    tickSpacing: z.number().int().min(1).max(32767),
    hooks: evmAddress,
    source: source,
  })
  .strict();

/**
 * Token EVM. Sengaja TANPA decimals: dokumen xStocks tidak menyebutnya, jadi nilainya dibaca on-chain (decimals())
 * saat runtime dan diperiksa oleh `pnpm registry:check`. Alamat hanya dari sumber resmi penerbit.
 */
export const evmTokenSchema = z
  .object({
    symbol: z.string().min(1).max(12),
    name: z.string().min(1),
    underlying: z.string().min(1),
    chain: z.enum(EVM_CHAIN_IDS),
    address: evmAddress,
    issuer: z.string(),
    addressSource: source,
    /** Hanya Uniswap v4: kolam tambahan di luar pencarian standar. */
    pools: z.array(evmPoolSchema).optional(),
    lastChecked: isoDate,
  })
  .strict();

export const evmTokensSchema = z.array(evmTokenSchema).superRefine((rows, ctx) => {
  const keys = new Set<string>();
  rows.forEach((r, i) => {
    const k = `${r.chain}:${r.symbol.toLowerCase()}`;
    const a = `${r.chain}:${r.address.toLowerCase()}`;
    if (keys.has(k)) ctx.addIssue({ code: "custom", path: [i, "symbol"], message: `Duplicate ${r.symbol} on ${r.chain}` });
    if (keys.has(a)) ctx.addIssue({ code: "custom", path: [i, "address"], message: `Duplicate address ${r.address}` });
    keys.add(k);
    keys.add(a);
  });
});

export type EvmPoolEntry = z.infer<typeof evmPoolSchema>;
export type EvmToken = z.infer<typeof evmTokenSchema>;
export type EvmChainId = (typeof EVM_CHAIN_IDS)[number];
