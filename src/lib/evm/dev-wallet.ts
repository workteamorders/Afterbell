import { EVM_CHAINS } from "./chains";
import type { Eip1193Provider, EvmWallet } from "./wallet";

/**
 * Wallet uji untuk fork lokal (`pnpm fork`). HANYA aktif bila situs dibangun dengan NEXT_PUBLIC_DEV_WALLET=1, halaman dibuka dari
 * localhost, dan RPC-nya alamat lokal. Ia memakai akun uji publik milik Anvil (kuncinya diketahui semua orang, jadi jangan pernah
 * dipakai di jaringan sungguhan) dan meneruskan transaksi ke node lokal yang membuka akun itu. Afterbell tetap tidak memegang kunci.
 *
 * Setiap transaksi meminta persetujuan lewat jendela konfirmasi browser, supaya jumlah permintaan dan urutannya bisa dilihat
 * seperti di wallet sungguhan, dan penolakan bisa dicoba (kode 4001).
 */
export const DEV_WALLET_RDNS = "dev-wallet.afterbell.local";
const DEV_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const LOCAL_RPC = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/;
const TARGET_CHAIN_HEX = `0x${EVM_CHAINS.robinhood.chainId.toString(16)}`;

const ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#555"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#fff" font-family="monospace">DEV</text></svg>');

/** Metode baca yang diteruskan apa adanya ke node lokal. Selain ini ditolak. */
const FORWARD = new Set(["eth_call", "eth_estimateGas", "eth_getBalance", "eth_gasPrice", "eth_blockNumber", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getCode", "eth_getTransactionCount", "eth_maxPriorityFeePerGas", "eth_feeHistory"]);

const SELECTORS: Record<string, string> = {
  "0x095ea7b3": "ERC-20 approve",
  "0x87517c45": "Permit2 approve",
  "0x3593564c": "Universal Router swap",
};

function rpcError(code: number, message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

export interface DevWalletOptions {
  rpcUrl: string;
  fetchImpl?: typeof fetch;
  confirmImpl?: (message: string) => boolean;
  /** Chain awal wallet. Bawaan: Ethereum (0x1), supaya alur "pindah ke Robinhood Chain" ikut teruji. */
  startChainId?: string;
}

export function createDevWallet(o: DevWalletOptions): EvmWallet {
  const doFetch = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const confirmTx = o.confirmImpl ?? ((m: string) => typeof window !== "undefined" && window.confirm(m));
  let chainId = o.startChainId ?? "0x1";
  let count = 0;

  async function forward(method: string, params: unknown[]): Promise<unknown> {
    const res = await doFetch(o.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (!res.ok) throw rpcError(-32603, `The local node answered HTTP ${res.status}. Is "pnpm fork" running?`);
    const body = (await res.json()) as { result?: unknown; error?: { code?: number; message?: string } };
    if (body.error) throw rpcError(body.error.code ?? -32603, body.error.message ?? "RPC error");
    return body.result;
  }

  const provider: Eip1193Provider = {
    async request({ method, params = [] }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [DEV_ACCOUNT];
        case "eth_chainId":
          return chainId;
        case "net_version":
          return String(parseInt(chainId, 16));
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain": {
          const id = (params[0] as { chainId?: unknown } | undefined)?.chainId;
          if (id === TARGET_CHAIN_HEX) {
            chainId = id;
            return null;
          }
          throw rpcError(4902, "Unrecognized chain ID. The dev wallet only knows Robinhood Chain.");
        }
        case "eth_sendTransaction": {
          if (chainId !== TARGET_CHAIN_HEX) throw rpcError(4901, "The dev wallet is on another chain. Switch to Robinhood Chain first.");
          const tx = params[0] as { from?: unknown; to?: unknown; data?: unknown; value?: unknown } | undefined;
          const ok = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v);
          if (!tx || !ok(tx.from, /^0x[0-9a-fA-F]{40}$/) || (tx.from as string).toLowerCase() !== DEV_ACCOUNT.toLowerCase() || !ok(tx.to, /^0x[0-9a-fA-F]{40}$/) || !ok(tx.data, /^0x([0-9a-fA-F]{2})*$/) || (tx.value !== undefined && !ok(tx.value, /^0x[0-9a-fA-F]*$/))) {
            throw rpcError(-32602, "The dev wallet received a malformed transaction.");
          }
          count += 1;
          const data = tx.data as string;
          const label = SELECTORS[data.slice(0, 10).toLowerCase()] ?? "Contract call";
          if (!confirmTx(`Dev wallet (local fork only)\n\nTransaction ${count}: ${label}\nTo: ${tx.to as string}\nData: ${data.slice(0, 10)}… (${(data.length - 2) / 2} bytes)\n\nOK = sign, Cancel = reject`)) {
            throw rpcError(4001, "User rejected the request.");
          }
          return forward("eth_sendTransaction", [{ from: tx.from, to: tx.to, data, value: tx.value ?? "0x0" }]);
        }
        default:
          if (FORWARD.has(method)) return forward(method, params);
          throw rpcError(4200, `The dev wallet does not support ${method}.`);
      }
    },
  };

  return { info: { uuid: "afterbell-dev-wallet", name: "Dev wallet (local fork)", icon: ICON, rdns: DEV_WALLET_RDNS }, provider };
}

let cached: EvmWallet | null = null;

/**
 * Wallet uji bila (dan hanya bila) tiga syarat terpenuhi: build memakai NEXT_PUBLIC_DEV_WALLET=1, halaman dibuka dari localhost,
 * dan alamat RPC adalah http://127.0.0.1 atau http://localhost. Di build produksi nilai variabel itu kosong, sehingga cabang ini
 * dibuang saat build (diperiksa oleh `pnpm lint:bundle`).
 */
export function devWalletIfEnabled(): EvmWallet | null {
  if (process.env.NEXT_PUBLIC_DEV_WALLET !== "1") return null;
  const rpc = process.env.NEXT_PUBLIC_DEV_RPC || "http://127.0.0.1:8545";
  if (typeof window === "undefined" || !LOCAL_HOST.test(window.location.hostname) || !LOCAL_RPC.test(rpc)) return null;
  cached ??= createDevWallet({ rpcUrl: rpc });
  return cached;
}
