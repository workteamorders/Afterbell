/**
 * Dipakai oleh `pnpm preview:dev`. Melonggarkan CSP di out/_headers (salinan lokal, BUKAN public/_headers) supaya wallet uji bisa
 * menyambung ke node lokal: menambahkan alamat RPC ke connect-src dan membuang upgrade-insecure-requests. File produksi tidak berubah.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function relaxHeaders(text: string, rpc = "http://127.0.0.1:8545"): string {
  return text
    .replace(/connect-src ([^;\n]*)/g, (_m, v: string) => (v.split(/\s+/).includes(rpc) ? `connect-src ${v}` : `connect-src ${v.trim()} ${rpc}`))
    .replace(/;\s*upgrade-insecure-requests/g, "");
}

if (process.argv[1]?.endsWith("dev-headers.ts")) {
  const file = join(process.cwd(), "out", "_headers");
  const before = readFileSync(file, "utf8");
  const after = relaxHeaders(before, process.env.NEXT_PUBLIC_DEV_RPC || "http://127.0.0.1:8545");
  if (after === before) console.log("out/_headers already allows the local node; nothing changed.");
  else {
    writeFileSync(file, after);
    console.log("out/_headers: connect-src now allows the local node and upgrade-insecure-requests is removed (local preview only).");
  }
}
