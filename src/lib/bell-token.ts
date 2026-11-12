import { getEvmChain } from "./evm/chains";

/**
 * Kontrak token BELL ("AfterBell Protocol") di Robinhood Chain, alamat dari pemilik proyek (D-070).
 * Nama, simbol, desimal dan suplai dibaca langsung dari kontrak lewat RPC publik; siapa penerbit dan pemiliknya
 * TIDAK diverifikasi di sini, jadi UI tidak menyebutnya "resmi" atau "terverifikasi". Aplikasi tidak memakai token ini.
 */
export const BELL_TOKEN = {
  name: "AfterBell Protocol",
  symbol: "BELL",
  decimals: 18,
  chainId: "robinhood",
  /** Bentuk EIP-55 dari 0x94f06e180395185adf2fa518fc8e542111b7aa00. */
  address: "0x94F06E180395185Adf2fA518fc8e542111b7Aa00",
} as const;

/** Halaman token di explorer yang sama dengan yang dipakai wallet dan tautan transaksi. */
export function bellTokenExplorerUrl(): string | undefined {
  const base = getEvmChain(BELL_TOKEN.chainId)?.walletAdd?.blockExplorerUrls[0];
  return base ? `${base.replace(/\/$/, "")}/token/${BELL_TOKEN.address}` : undefined;
}
