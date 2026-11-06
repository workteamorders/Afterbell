/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: seluruh logika berjalan di browser (lihat docs/DECISIONS.md D-002, D-003).
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
