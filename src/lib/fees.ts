export const MIN_REFERRAL_BPS = 50;
export const MAX_REFERRAL_BPS = 255;
export const DEFAULT_REFERRAL_BPS = 50;

/** REFERRAL_FEE_BPS: default 50, dijepit ke 50 sampai 255 (rentang yang diterima Jupiter). Nilai tak valid jatuh ke default. */
export function clampReferralBps(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_REFERRAL_BPS;
  return Math.min(MAX_REFERRAL_BPS, Math.max(MIN_REFERRAL_BPS, Math.round(n)));
}

export interface OrderFeeFields {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeBps?: number | null;
  feeMint?: string | null;
  referralAccount?: string | null;
  platformFee?: { amount?: string | null; feeBps?: number | null; feeMint?: string | null } | null;
}

export interface FeeDisplay {
  /** Biaya Afterbell yang benar-benar dipungut menurut respons. 0 bila tidak terbukti. */
  afterbellBps: number;
  /** Biaya platform Jupiter yang berlaku bila referral tidak aktif. */
  jupiterBps: number;
  feeMint?: string;
  /** Nominal biaya dalam satuan terkecil feeMint, bila diketahui. */
  afterbellAmountRaw?: bigint;
  amountIsEstimate: boolean;
  status: "charged" | "not-configured" | "not-applied" | "token-account-missing";
}

interface FeeContext {
  /** Referral account milik Afterbell dari konfigurasi publik, bila ada. */
  referralAccount?: string;
  /** referralFee yang diminta. */
  requestedBps: number;
  /** true/false bila diperiksa, undefined bila pemeriksaan tidak tersedia. */
  referralTokenAccountExists?: boolean;
}

/**
 * Aturan D-008: biaya Afterbell tampil hanya bila respons membuktikannya.
 * Syaratnya: referralAccount di respons = milik Afterbell, dan feeBps = referralFee yang diminta.
 * Bila referralTokenAccount untuk feeMint terbukti belum ada, tampil 0.
 * Tidak pernah menampilkan biaya yang tidak dipungut.
 */
export function resolveFeeDisplay(order: OrderFeeFields, ctx: FeeContext): FeeDisplay {
  const feeMint = order.feeMint ?? order.platformFee?.feeMint ?? undefined;
  const jupiterFromPlatform = order.platformFee?.feeBps ?? 0;

  if (!ctx.referralAccount) {
    return {
      afterbellBps: 0,
      jupiterBps: order.feeBps ?? jupiterFromPlatform,
      feeMint,
      amountIsEstimate: false,
      status: "not-configured",
    };
  }

  const matches = order.referralAccount === ctx.referralAccount && order.feeBps === ctx.requestedBps;
  if (!matches) {
    return { afterbellBps: 0, jupiterBps: order.feeBps ?? jupiterFromPlatform, feeMint, amountIsEstimate: false, status: "not-applied" };
  }
  if (ctx.referralTokenAccountExists === false) {
    return { afterbellBps: 0, jupiterBps: order.feeBps ?? jupiterFromPlatform, feeMint, amountIsEstimate: false, status: "token-account-missing" };
  }

  let amount: bigint | undefined;
  let estimate = false;
  const platformAmount = order.platformFee?.amount;
  if (typeof platformAmount === "string" && /^\d+$/.test(platformAmount) && order.platformFee?.feeBps === order.feeBps) {
    amount = BigInt(platformAmount);
  } else if (feeMint && (feeMint === order.inputMint || feeMint === order.outputMint)) {
    const base = BigInt(feeMint === order.inputMint ? order.inAmount : order.outAmount);
    amount = (base * BigInt(ctx.requestedBps)) / 10_000n;
    estimate = true;
  }
  return { afterbellBps: ctx.requestedBps, jupiterBps: 0, feeMint, afterbellAmountRaw: amount, amountIsEstimate: estimate, status: "charged" };
}
