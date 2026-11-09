import type { EvmChainId } from "../registry/evm-schema";

/**
 * Konfigurasi chain EVM. Setiap alamat di sini berasal dari sumber yang disebut di `sources`.
 * Dokumen Uniswap memperingatkan bahwa alamat tidak boleh diasumsikan sama antar chain, jadi tiap chain punya set sendiri.
 * Chain ID diperiksa terhadap RPC oleh `pnpm registry:check`.
 */
interface EvmChainBase {
  id: EvmChainId;
  chainId: number;
  name: string;
  nativeSymbol: string;
  explorerTx: string;
  /** Aset kuotasi berdenominasi dolar AS yang dipakai untuk membeli dan menjual token. */
  usd: {
    symbol: string;
    address: `0x${string}`;
    decimals: number;
    /** true bila decimals tertulis di sumber resmi. Bila false, nilai dibaca dan dicocokkan on-chain saat runtime. */
    decimalsVerified: boolean;
  };
  /** Parameter wallet_addEthereumChain, dipakai bila wallet pengguna belum mengenal chain ini. */
  walletAdd?: { chainName: string; rpcUrls: readonly string[]; blockExplorerUrls: readonly string[] };
  sources: ReadonlyArray<{ label: string; url: string }>;
}

export interface EvmChainV3 extends EvmChainBase {
  venue: "uniswap-v3";
  uniswapV3: { quoterV2: `0x${string}`; swapRouter02: `0x${string}`; factory: `0x${string}` };
  /** Tingkat biaya kolam yang DICOBA saat kuotasi. Kolam dengan tingkat lain tidak ditemukan. */
  feeTiers: readonly number[];
}

export interface EvmChainV4 extends EvmChainBase {
  venue: "uniswap-v4";
  uniswapV4: {
    poolManager: `0x${string}`;
    universalRouter: `0x${string}`;
    quoter: `0x${string}`;
    stateView: `0x${string}`;
    permit2: `0x${string}`;
  };
  /**
   * Pasangan (biaya, tickSpacing) kolam TANPA hook yang DICOBA saat kuotasi. Kolam dengan hook atau parameter lain
   * tidak ditemukan kecuali ditambahkan lewat `pools` di registry token.
   */
  poolGrid: ReadonlyArray<{ fee: number; tickSpacing: number }>;
}

export type EvmChain = EvmChainV3 | EvmChainV4;

export const EVM_CHAINS: { ethereum: EvmChainV3; robinhood: EvmChainV4 } = {
  ethereum: {
    id: "ethereum",
    venue: "uniswap-v3",
    chainId: 1,
    name: "Ethereum",
    nativeSymbol: "ETH",
    explorerTx: "https://etherscan.io/tx/",
    usd: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, decimalsVerified: true },
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
  robinhood: {
    id: "robinhood",
    venue: "uniswap-v4",
    chainId: 4663,
    name: "Robinhood Chain",
    nativeSymbol: "ETH",
    explorerTx: "https://robinhoodchain.blockscout.com/tx/",
    // USDG (Paxos) tercantum di halaman Token Contracts Robinhood tanpa decimals. Decimals dibaca dan dicocokkan on-chain.
    usd: { symbol: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6, decimalsVerified: false },
    walletAdd: { chainName: "Robinhood Chain", rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] },
    uniswapV4: {
      poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
      universalRouter: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
      quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
      stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    poolGrid: [
      { fee: 100, tickSpacing: 1 },
      { fee: 500, tickSpacing: 10 },
      { fee: 3000, tickSpacing: 60 },
      { fee: 10000, tickSpacing: 200 },
    ],
    sources: [
      { label: "Robinhood Chain: Connecting (chain ID 4663, RPC, explorer)", url: "https://docs.robinhood.com/chain/connecting" },
      { label: "Robinhood Chain: Token Contracts (USDG, WETH)", url: "https://docs.robinhood.com/chain/contracts" },
      { label: "Uniswap v4 deployments (Robinhood Chain, chain ID 4663)", url: "https://developers.uniswap.org/docs/protocols/v4/deployments" },
    ],
  },
};

export function getEvmChain(id: string): EvmChain | undefined {
  return (EVM_CHAINS as Record<string, EvmChain | undefined>)[id];
}

/** Kontrak router per chain: tujuan transaksi swap. */
export function routerAddress(chain: EvmChain): `0x${string}` {
  return chain.venue === "uniswap-v3" ? chain.uniswapV3.swapRouter02 : chain.uniswapV4.universalRouter;
}

/** Nama venue untuk teks UI, mis. "Uniswap v3". */
export function venueName(chain: EvmChain): string {
  return chain.venue === "uniswap-v3" ? "Uniswap v3" : "Uniswap v4";
}

/** Alamat kontrak yang dipakai untuk bertransaksi. Panggilan eth_call ke alamat ini dianggap persiapan transaksi (diblokir per negara). */
export function tradeTargets(): string[] {
  return Object.values(EVM_CHAINS).map((c) => routerAddress(c).toLowerCase());
}

/** Alamat explorer untuk satu transaksi di chain tertentu. */
export function explorerTxBase(chainId: string): string | undefined {
  return getEvmChain(chainId)?.explorerTx;
}

/** Alamat halaman token EVM. Ethereum tetap di /e/<simbol>; chain lain di /e/<chain>/<simbol>. */
export function evmTokenPath(token: { chain: string; symbol: string }): string {
  return token.chain === "ethereum" ? `/e/${token.symbol}` : `/e/${token.chain}/${token.symbol}`;
}
