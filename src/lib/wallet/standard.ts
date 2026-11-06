import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, StandardEvents, type StandardConnectFeature, type StandardEventsFeature } from "@wallet-standard/features";
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from "@solana/wallet-standard-features";

/** Rantai untuk transaksi mainnet pada Wallet Standard. */
export const MAINNET = "solana:mainnet" as const;

export type SolanaWallet = Wallet & {
  features: Wallet["features"] & StandardConnectFeature & SolanaSignTransactionFeature;
};

export function isSolanaWallet(w: Wallet): w is SolanaWallet {
  return StandardConnect in w.features && SolanaSignTransaction in w.features && w.chains.some((c) => c === MAINNET);
}

export function listWallets(): SolanaWallet[] {
  return getWallets().get().filter(isSolanaWallet);
}

/** Berlangganan perubahan daftar wallet (ekstensi yang memuat belakangan). Mengembalikan fungsi berhenti. */
export function watchWallets(cb: () => void): () => void {
  const api = getWallets();
  const offA = api.on("register", cb);
  const offB = api.on("unregister", cb);
  return () => {
    offA();
    offB();
  };
}

export async function connectWallet(wallet: SolanaWallet, silent = false): Promise<WalletAccount | null> {
  const feature = wallet.features[StandardConnect];
  const { accounts } = await feature.connect({ silent });
  return accounts.find((a) => a.chains.includes(MAINNET)) ?? accounts[0] ?? null;
}

export async function disconnectWallet(wallet: SolanaWallet): Promise<void> {
  const f = (wallet.features as Record<string, unknown>)["standard:disconnect"] as { disconnect: () => Promise<void> } | undefined;
  await f?.disconnect();
}

/** Mendengarkan perubahan akun wallet (mis. pengguna mengganti akun di ekstensi). */
export function onAccountChange(wallet: SolanaWallet, cb: (accounts: readonly WalletAccount[]) => void): () => void {
  const f = (wallet.features as Partial<StandardEventsFeature>)[StandardEvents];
  if (!f) return () => undefined;
  return f.on("change", (props) => {
    if (props.accounts) cb(props.accounts);
  });
}

/** Meminta wallet menandatangani transaksi (byte serial). Wallet menjaga kunci; Afterbell tidak pernah melihatnya. */
export async function signWithWallet(wallet: SolanaWallet, account: WalletAccount, transaction: Uint8Array): Promise<Uint8Array> {
  const feature = wallet.features[SolanaSignTransaction];
  const [out] = await feature.signTransaction({ account, transaction, chain: MAINNET });
  if (!out) throw new Error("Wallet returned no signed transaction.");
  return out.signedTransaction;
}
