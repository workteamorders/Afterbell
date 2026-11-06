/**
 * Jumlah token. Jumlah ke Jupiter selalu mentah (bigint, satuan terkecil).
 * Jumlah tampil untuk Token-2022 dengan Scaled UI Amount = mentah × multiplier ÷ 10^decimals (D-011).
 */
export function parseDecimalToRaw(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const raw = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return raw;
}

export function rawToDecimalString(raw: bigint, decimals: number, maxFraction = decimals): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  frac = frac.slice(0, maxFraction).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

export interface ScaledConfig {
  multiplier: number;
  newMultiplier?: number;
  /** Detik sejak epoch. */
  effectiveTimestamp?: number;
}

/** Multiplier yang berlaku pada `nowSec`. Konfigurasi tak lengkap dianggap 1. */
export function activeMultiplier(cfg: ScaledConfig | undefined, nowSec: number): number {
  if (!cfg || !Number.isFinite(cfg.multiplier) || cfg.multiplier <= 0) return 1;
  if (cfg.newMultiplier !== undefined && cfg.effectiveTimestamp !== undefined && nowSec >= cfg.effectiveTimestamp && Number.isFinite(cfg.newMultiplier) && cfg.newMultiplier > 0) {
    return cfg.newMultiplier;
  }
  return cfg.multiplier;
}

/** Jumlah tampil sebagai angka (untuk tampilan dan nilai kasar, bukan untuk dikirim). */
export function uiAmount(raw: bigint, decimals: number, multiplier = 1): number {
  const whole = Number(raw / 10n ** BigInt(decimals));
  const frac = Number(raw % 10n ** BigInt(decimals)) / 10 ** decimals;
  return (whole + frac) * multiplier;
}

export function formatNumber(n: number, maxFraction = 4): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFraction });
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2, minimumFractionDigits: 2 });
}
