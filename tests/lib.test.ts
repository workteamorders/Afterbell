import { describe, expect, it } from "vitest";
import { clampReferralBps, resolveFeeDisplay } from "../src/lib/fees";
import { activeMultiplier, formatNumber, parseDecimalToRaw, rawToDecimalString, uiAmount } from "../src/lib/amounts";
import { deriveAta } from "../src/lib/ata";
import { USDC_MINT } from "../src/lib/solana/programs";

describe("REFERRAL_FEE_BPS clamp", () => {
  it("defaults to 50 when missing or invalid", () => {
    for (const v of [undefined, "", "abc", null, Number.NaN]) expect(clampReferralBps(v)).toBe(50);
  });
  it("clamps to the 50..255 range Jupiter accepts", () => {
    expect(clampReferralBps(0)).toBe(50);
    expect(clampReferralBps("10")).toBe(50);
    expect(clampReferralBps("50")).toBe(50);
    expect(clampReferralBps("100")).toBe(100);
    expect(clampReferralBps(255)).toBe(255);
    expect(clampReferralBps("1000")).toBe(255);
    expect(clampReferralBps(-5)).toBe(50);
    expect(clampReferralBps("99.6")).toBe(100);
  });
});

describe("Afterbell fee display (never shows a fee that is not charged)", () => {
  const base = { inputMint: USDC_MINT, outputMint: "OUT", inAmount: "100000000", outAmount: "25855038" };
  const ref = "REFACCOUNT";

  it("shows the fee when the response proves it", () => {
    const f = resolveFeeDisplay({ ...base, feeBps: 50, feeMint: USDC_MINT, referralAccount: ref, platformFee: { amount: "500000", feeBps: 50, feeMint: USDC_MINT } }, { referralAccount: ref, requestedBps: 50 });
    expect(f.status).toBe("charged");
    expect(f.afterbellBps).toBe(50);
    expect(f.afterbellAmountRaw).toBe(500000n);
    expect(f.amountIsEstimate).toBe(false);
  });

  it("estimates the amount when the response carries no platformFee amount, and says so", () => {
    const f = resolveFeeDisplay({ ...base, feeBps: 50, feeMint: USDC_MINT, referralAccount: ref }, { referralAccount: ref, requestedBps: 50 });
    expect(f.afterbellAmountRaw).toBe(500000n);
    expect(f.amountIsEstimate).toBe(true);
  });

  it("shows 0 when the response falls back to the platform fee (referral token account missing)", () => {
    const f = resolveFeeDisplay({ ...base, feeBps: 10, feeMint: USDC_MINT, platformFee: { feeBps: 10, feeMint: USDC_MINT } }, { referralAccount: ref, requestedBps: 50 });
    expect(f.afterbellBps).toBe(0);
    expect(f.jupiterBps).toBe(10);
    expect(f.status).toBe("not-applied");
  });

  it("shows 0 when the referral token account is positively missing", () => {
    const f = resolveFeeDisplay({ ...base, feeBps: 50, feeMint: USDC_MINT, referralAccount: ref }, { referralAccount: ref, requestedBps: 50, referralTokenAccountExists: false });
    expect(f.afterbellBps).toBe(0);
    expect(f.status).toBe("token-account-missing");
  });

  it("shows 0 when no referral account is configured", () => {
    const f = resolveFeeDisplay({ ...base, feeBps: 10, feeMint: USDC_MINT }, { requestedBps: 50 });
    expect(f.afterbellBps).toBe(0);
    expect(f.jupiterBps).toBe(10);
    expect(f.status).toBe("not-configured");
  });

  it("shows 0 when the response names a different referral account", () => {
    const f = resolveFeeDisplay({ ...base, feeBps: 50, feeMint: USDC_MINT, referralAccount: "SOMEONEELSE" }, { referralAccount: ref, requestedBps: 50 });
    expect(f.afterbellBps).toBe(0);
  });
});

describe("amounts", () => {
  it("parses decimals to raw without floating point", () => {
    expect(parseDecimalToRaw("1.5", 8)).toBe(150000000n);
    expect(parseDecimalToRaw("0.00000001", 8)).toBe(1n);
    expect(parseDecimalToRaw("100", 6)).toBe(100000000n);
    expect(parseDecimalToRaw("1,000.25", 6)).toBe(1000250000n);
  });
  it("rejects invalid input and too many decimals", () => {
    for (const s of ["", ".", "abc", "1.2.3", "-1", "0.000000001"]) expect(parseDecimalToRaw(s, 8)).toBeNull();
  });
  it("formats raw amounts", () => {
    expect(rawToDecimalString(25855038n, 8)).toBe("0.25855038");
    expect(rawToDecimalString(100000000n, 8)).toBe("1");
    expect(rawToDecimalString(1n, 8, 4)).toBe("0");
  });
  it("applies the scaled UI multiplier for display only", () => {
    expect(uiAmount(100000000n, 8, 1.008)).toBeCloseTo(1.008, 10);
    expect(activeMultiplier({ multiplier: 1, newMultiplier: 4, effectiveTimestamp: 1000 }, 999)).toBe(1);
    expect(activeMultiplier({ multiplier: 1, newMultiplier: 4, effectiveTimestamp: 1000 }, 1000)).toBe(4);
    expect(activeMultiplier(undefined, 5)).toBe(1);
    expect(formatNumber(1234.56789)).toBe("1,234.5679");
  });
});

describe("ATA derivation", () => {
  // Pemilik uji: alamat program System (valid, off-curve tidak diperlukan oleh derivasi ATA).
  const owner = "11111111111111111111111111111111";
  it("is deterministic and differs by token program", async () => {
    const a1 = await deriveAta(owner, USDC_MINT, "token");
    const a2 = await deriveAta(owner, USDC_MINT, "token");
    const a3 = await deriveAta(owner, USDC_MINT, "token-2022");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(a3);
    expect(a1).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
  it("differs by owner", async () => {
    const other = await deriveAta("So11111111111111111111111111111111111111112", USDC_MINT, "token");
    expect(other).not.toBe(await deriveAta(owner, USDC_MINT, "token"));
  });
});
