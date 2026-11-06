import { z } from "zod";
import { CONFIG } from "./config";

/**
 * Status wilayah dari function /api/rpc (GET). Negara berasal dari header Cloudflare; daftar blokir ada di
 * variabel lingkungan BLOCKED_COUNTRIES. Ini bukan pengganti tinjauan hukum.
 */
const geoSchema = z.object({ country: z.string().nullable(), blocked: z.boolean() });

export type GeoStatus =
  | { kind: "allowed"; country: string | null }
  | { kind: "blocked"; country: string | null }
  | { kind: "unknown"; reason: string };

export async function fetchGeoStatus(fetchImpl: typeof fetch = (...a) => fetch(...a), path: string = CONFIG.rpcPath): Promise<GeoStatus> {
  try {
    const res = await fetchImpl(path, { method: "GET", headers: { accept: "application/json" } });
    if (!res.ok) return { kind: "unknown", reason: `Region check answered HTTP ${res.status}.` };
    const parsed = geoSchema.safeParse(await res.json());
    if (!parsed.success) return { kind: "unknown", reason: "Region check returned an unexpected response." };
    return parsed.data.blocked ? { kind: "blocked", country: parsed.data.country } : { kind: "allowed", country: parsed.data.country };
  } catch {
    return { kind: "unknown", reason: "Region check could not be reached." };
  }
}

/** Beli dan jual hanya tersedia bila wilayah terbukti diizinkan. Tidak diketahui = lihat-saja (gagal aman). */
export function canTrade(status: GeoStatus | undefined): boolean {
  return status?.kind === "allowed";
}
