import blocked from "../../registry/blocked-wallets.json";

/**
 * Penyaringan wallet (lisensi Jupiter §7.3, D-016). Daftar sisi klien dari `registry/blocked-wallets.json`.
 * Daftar awal KOSONG: pemilik harus memilih penyedia atau sumber penyaringan. Selama kosong, tidak ada alamat yang ditolak
 * dan laporan akhir menandai ini sebagai belum selesai.
 */
const LIST: ReadonlySet<string> = new Set((blocked as { addresses: string[] }).addresses);

export function isScreenedWallet(address: string): boolean {
  return LIST.has(address);
}

export const SCREENING_LIST_SIZE = LIST.size;
