/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: seluruh logika berjalan di browser (lihat docs/DECISIONS.md D-002, D-003).
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  // Selalu tertanam (kosong di build produksi) supaya kode wallet uji (src/lib/evm/dev-wallet.ts) dibuang saat build.
  // Tanpa ini variabel yang tidak diset tidak diganti, cabangnya tidak bisa dibuang, dan kodenya ikut terkirim.
  env: {
    NEXT_PUBLIC_DEV_WALLET: process.env.NEXT_PUBLIC_DEV_WALLET ?? "",
    NEXT_PUBLIC_DEV_RPC: process.env.NEXT_PUBLIC_DEV_RPC ?? "",
  },
};

export default nextConfig;
