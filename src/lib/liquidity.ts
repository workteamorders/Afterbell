/**
 * Meter likuiditas (D-007). Kuotasi pada tiga ukuran order dihitung menjadi harga efektif per token.
 * Penyimpangan = seberapa jauh harga efektif ukuran besar lebih buruk daripada harga efektif $100.
 * Rute RFQ (JupiterZ) melaporkan priceImpact sekitar 0, jadi field itu tidak dipakai.
 *
 * Ambang awal (ditulis di /methodology): dipilih dari kisaran slippage tipikal yang dilaporkan (0,1 sampai 0,5 persen
 * pada jam pasar), bukan dari kecocokan terhadap kumpulan data. Dapat diubah di sini dan di /methodology bersamaan.
 */
export const NOTIONALS_USD = [100, 1_000, 10_000] as const;

export const THRESHOLDS = {
  /** Deep bila penyimpangan pada $10.000 di bawah nilai ini (persen). */
  deepBelowPct: 0.5,
  /** Medium bila di bawah nilai ini; selain itu Thin. */
  mediumBelowPct: 2,
} as const;

export type DepthLevel = "deep" | "medium" | "thin";

export interface SizedQuote {
  notionalUsd: number;
  inAmount: bigint;
  outAmount: bigint;
  router?: string;
}

export interface DepthPoint {
  notionalUsd: number;
  impactPct: number;
}

export interface LiquidityResult {
  level: DepthLevel;
  points: [DepthPoint, DepthPoint, DepthPoint];
  route: string;
}

/** Harga efektif = input per output dalam satuan tampil. Lebih kecil lebih baik bagi pembeli. */
function unitCost(q: SizedQuote, inDecimals: number, outDecimals: number): number {
  const input = Number(q.inAmount) / 10 ** inDecimals;
  const output = Number(q.outAmount) / 10 ** outDecimals;
  return input / output;
}

export function classify(impactAt10kPct: number): DepthLevel {
  if (impactAt10kPct < THRESHOLDS.deepBelowPct) return "deep";
  if (impactAt10kPct < THRESHOLDS.mediumBelowPct) return "medium";
  return "thin";
}

/**
 * Menghitung hasil meter dari tiga kuotasi beli (stablecoin ke token).
 * Penyimpangan negatif (harga lebih baik pada ukuran besar) dipotong ke 0.
 */
export function computeLiquidity(quotes: readonly [SizedQuote, SizedQuote, SizedQuote], inDecimals: number, outDecimals: number): LiquidityResult | null {
  if (quotes.some((q) => q.outAmount <= 0n || q.inAmount <= 0n)) return null;
  const base = unitCost(quotes[0], inDecimals, outDecimals);
  if (!Number.isFinite(base) || base <= 0) return null;

  const points = quotes.map((q) => {
    const c = unitCost(q, inDecimals, outDecimals);
    const pct = Math.max(0, (c / base - 1) * 100);
    return { notionalUsd: q.notionalUsd, impactPct: Math.round(pct * 1000) / 1000 };
  }) as [DepthPoint, DepthPoint, DepthPoint];

  const routes = Array.from(new Set(quotes.map((q) => q.router).filter((r): r is string => !!r)));
  return { level: classify(points[2].impactPct), points, route: routes.length ? routes.map(routeLabel).join(", ") : "Unknown route" };
}

export function routeLabel(router: string): string {
  switch (router) {
    case "metis":
      return "Jupiter aggregator";
    case "jupiterz":
      return "JupiterZ (RFQ)";
    case "dflow":
      return "DFlow";
    case "okx":
      return "OKX";
    default:
      return router;
  }
}
