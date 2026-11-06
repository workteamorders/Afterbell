import type { EvmChainId } from "../registry/evm-schema";

/**
 * Konfigurasi chain EVM. Setiap alamat di sini berasal dari sumber yang disebut di `sources` (diambil 2026-11-04).
 * Dokumen Uniswap memperingatkan bahwa alamat tidak boleh diasumsikan sama antar chain, jadi tiap chain punya set sendiri.
 * Chain ID diperiksa terhadap RPC oleh `pnpm registry:check`.
 */
export interface EvmChain {
  id: EvmChainId;
  chainId: number;
  name: string;
  nativeSymbol: string;
  explorerTx: string;
  usdc: { address: `0x${string}`; decimals: number };
  uniswapV3: { quoterV2: `0x${string}`; swapRouter02: `0x${string}`; factory: `0x${string}` };
  /** Tingkat biaya kolam yang DICOBA saat kuotasi. Kolam dengan tingkat lain tidak ditemukan. */
  feeTiers: readonly number[];
  sources: ReadonlyArray<{ label: string; url: string }>;
}

export const EVM_CHAINS: Record<EvmChainId, EvmChain> = {
  ethereum: {
    id: "ethereum",
    chainId: 1,
    name: "Ethereum",
    nativeSymbol: "ETH",
    explorerTx: "https://etherscan.io/tx/",
    usdc: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    uniswapV3: {
      quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
      swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
    feeTiers: [100, 500, 3000, 10000],
    sources: [
      { label: "Uniswap v3 Ethereum deployments", url: "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments" },
      { label: "xStocks API (USDC on Ethereum, 6 decimals)", url: "https://api.xstocks.fi/api/v2/public/assets/TSLAx" },
    ],
  },
};

export function getEvmChain(id: string): EvmChain | undefined {
  return (EVM_CHAINS as Record<string, EvmChain | undefined>)[id];
}

/** Alamat kontrak yang dipakai untuk bertransaksi. Panggilan eth_call ke alamat ini dianggap persiapan transaksi (diblokir per negara). */
export function tradeTargets(): string[] {
  return Object.values(EVM_CHAINS).flatMap((c) => [c.uniswapV3.swapRouter02.toLowerCase()]);
}
