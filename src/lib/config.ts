import { clampReferralBps } from "./fees";

/**
 * Konfigurasi publik. Next.js menyisipkan NEXT_PUBLIC_* saat build, jadi tiap variabel harus dirujuk secara literal.
 * Tidak ada rahasia di sini: kunci RPC hanya ada di variabel lingkungan Cloudflare Functions.
 */
export const CONFIG = {
  /** Path function relay RPC (satu-satunya kode server). */
  rpcPath: process.env.NEXT_PUBLIC_RPC_PATH || "/api/rpc",
  /** Basis API Jupiter Swap v2. */
  jupiterBase: process.env.NEXT_PUBLIC_JUPITER_BASE || "https://api.jup.ag/swap/v2",
  /** Referral account milik Afterbell. Kosong berarti referral tidak aktif dan biaya Afterbell = 0. */
  referralAccount: process.env.NEXT_PUBLIC_REFERRAL_ACCOUNT || undefined,
  referralFeeBps: clampReferralBps(process.env.NEXT_PUBLIC_REFERRAL_FEE_BPS),
  explorerTxBase: process.env.NEXT_PUBLIC_EXPLORER_TX_BASE || "https://explorer.solana.com/tx/",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://afterbell.example").replace(/\/$/, ""),
  /** Data contoh diberi label "EXAMPLE" di UI bila true. Dipakai hanya untuk tinjauan visual dan e2e. */
  sampleData: process.env.NEXT_PUBLIC_SAMPLE_DATA === "1",
} as const;
