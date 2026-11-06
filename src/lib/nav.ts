export interface NavItem {
  href: string;
  label: string;
}

/** Navigasi utama. Tidak ada halaman Buat atau Profil (lihat spesifikasi produk). */
export const NAV: readonly NavItem[] = [
  { href: "/explore", label: "Explore" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/methodology", label: "Methodology" },
  { href: "/help", label: "Help" },
];
