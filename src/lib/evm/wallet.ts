/**
 * Wallet EVM lewat EIP-6963 (penemuan wallet) dan EIP-1193 (permintaan). Afterbell tidak pernah memegang kunci:
 * wallet menandatangani dan mengirim sendiri lewat eth_sendTransaction. Semua yang dikembalikan provider diperlakukan sebagai data.
 */
import { devWalletIfEnabled } from "./dev-wallet";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface EvmWalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EvmWallet {
  info: EvmWalletInfo;
  provider: Eip1193Provider;
}

function isWallet(d: unknown): d is EvmWallet {
  if (typeof d !== "object" || d === null) return false;
  const w = d as { info?: Record<string, unknown>; provider?: { request?: unknown } };
  return typeof w.info?.uuid === "string" && typeof w.info.name === "string" && typeof w.info.icon === "string" && typeof w.info.rdns === "string" && typeof w.provider?.request === "function";
}

/** Berlangganan wallet yang mengumumkan diri. Mengembalikan fungsi berhenti. */
export function watchEvmWallets(cb: (wallets: EvmWallet[]) => void): () => void {
  const found = new Map<string, EvmWallet>();
  const onAnnounce = (e: Event) => {
    const detail = (e as CustomEvent).detail as unknown;
    if (!isWallet(detail)) return;
    // Hanya ikon data: yang diterima (sesuai EIP-6963); selain itu tidak ditampilkan.
    const icon = detail.info.icon.startsWith("data:image/") ? detail.info.icon : "";
    found.set(detail.info.uuid, { info: { ...detail.info, icon }, provider: detail.provider });
    cb([...found.values()]);
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Wallet uji untuk fork lokal; null di build produksi (lihat dev-wallet.ts).
  const dev = devWalletIfEnabled();
  if (dev) {
    found.set(dev.info.uuid, dev);
    cb([...found.values()]);
  }
  return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
}

function firstAddress(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const a = v[0];
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) ? a : null;
}

/** Meminta izin akun. silent = true memakai eth_accounts (tanpa jendela) untuk sambung ulang. */
export async function connectEvm(provider: Eip1193Provider, silent = false): Promise<string | null> {
  return firstAddress(await provider.request({ method: silent ? "eth_accounts" : "eth_requestAccounts" }));
}

export async function walletChainId(provider: Eip1193Provider): Promise<number | null> {
  const v = await provider.request({ method: "eth_chainId" });
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]+$/.test(v)) return null;
  return Number(BigInt(v));
}

export interface AddChainParams {
  chainName: string;
  rpcUrls: readonly string[];
  blockExplorerUrls: readonly string[];
  nativeSymbol: string;
}

/** Kode 4902 (atau pesan "unrecognized chain") berarti wallet belum mengenal chain itu. */
function isUnknownChain(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const msg = e instanceof Error ? e.message : "";
  return code === 4902 || /unrecognized chain|not been added|unknown chain/i.test(msg);
}

/**
 * Meminta wallet pindah chain. Bila wallet belum mengenalnya dan `add` diberikan, wallet diminta menambahkannya
 * (wallet menampilkan jendela persetujuan sendiri dan memeriksa parameter yang diberikan).
 */
export async function switchChain(provider: Eip1193Provider, chainId: number, add?: AddChainParams): Promise<void> {
  const hex = `0x${chainId.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    if (!add || !isUnknownChain(e)) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hex, chainName: add.chainName, nativeCurrency: { name: "Ether", symbol: add.nativeSymbol, decimals: 18 }, rpcUrls: [...add.rpcUrls], blockExplorerUrls: [...add.blockExplorerUrls] }],
    });
  }
}

export interface TxRequest {
  from: string;
  to: string;
  data: string;
  value?: string;
}

/** Wallet menampilkan permintaan persetujuan dan mengembalikan hash transaksi. */
export async function sendTransaction(provider: Eip1193Provider, tx: TxRequest): Promise<string> {
  const hash = await provider.request({ method: "eth_sendTransaction", params: [{ ...tx, value: tx.value ?? "0x0" }] });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet did not return a transaction hash.");
  return hash;
}

/** Kode galat EIP-1193 4001 = pengguna menolak. */
export function isUserRejection(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const msg = e instanceof Error ? e.message : "";
  return code === 4001 || /reject|denied|cancel/i.test(msg);
}
