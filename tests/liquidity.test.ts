import { describe, expect, it } from "vitest";
import { classify, computeLiquidity, THRESHOLDS } from "../src/lib/liquidity";
import { CoalescingCache, SlidingWindowLimiter } from "../src/lib/limiter";
import { JupiterClient, buildOrderQuery } from "../src/lib/jupiter";
import { decodeTokenAmount, scaledConfigFromMint } from "../src/lib/portfolio";
import { canTrade } from "../src/lib/geo";

const q = (usd: number, out: bigint, router = "jupiterz") => ({ notionalUsd: usd, inAmount: BigInt(usd) * 1_000_000n, outAmount: out, router });

describe("liquidity meter", () => {
  it("is Deep when the $10,000 price is within the Deep threshold of the $100 price", () => {
    // 100 USDC -> 0.25 token (8 decimals); mulai dari harga sama, 10k turun 0,2 persen
    const r = computeLiquidity([q(100, 25_000_000n), q(1_000, 250_000_000n), q(10_000, 2_495_000_000n)], 6, 8);
    expect(r?.level).toBe("deep");
    expect(r?.points[2].impactPct).toBeCloseTo(0.2, 2);
  });
  it("is Medium between the thresholds and Thin above", () => {
    const med = computeLiquidity([q(100, 25_000_000n), q(1_000, 249_000_000n), q(10_000, 2_475_000_000n)], 6, 8);
    expect(med?.level).toBe("medium"); // 2500/2475 - 1 = 1,01 persen
    const thin = computeLiquidity([q(100, 25_000_000n), q(1_000, 240_000_000n), q(10_000, 2_000_000_000n)], 6, 8);
    expect(thin?.level).toBe("thin");
  });
  it("matches the documented thresholds exactly", () => {
    expect(classify(THRESHOLDS.deepBelowPct - 0.001)).toBe("deep");
    expect(classify(THRESHOLDS.deepBelowPct)).toBe("medium");
    expect(classify(THRESHOLDS.mediumBelowPct - 0.001)).toBe("medium");
    expect(classify(THRESHOLDS.mediumBelowPct)).toBe("thin");
  });
  it("treats a better price at larger size as zero impact, never negative", () => {
    const r = computeLiquidity([q(100, 25_000_000n), q(1_000, 251_000_000n), q(10_000, 2_520_000_000n)], 6, 8);
    expect(r?.points.every((p) => p.impactPct >= 0)).toBe(true);
    expect(r?.level).toBe("deep");
  });
  it("returns null for empty quotes", () => {
    expect(computeLiquidity([q(100, 0n), q(1_000, 1n), q(10_000, 1n)], 6, 8)).toBeNull();
  });
  it("names the router", () => {
    expect(computeLiquidity([q(100, 25_000_000n), q(1_000, 250_000_000n), q(10_000, 2_500_000_000n, "metis")], 6, 8)?.route).toMatch(/JupiterZ.*Jupiter aggregator/);
  });
});

describe("rate budget and coalescing", () => {
  it("allows the budget then refuses until the window slides", () => {
    let t = 0;
    const l = new SlidingWindowLimiter(3, 1000, () => t);
    expect([l.tryAcquire(), l.tryAcquire(), l.tryAcquire(), l.tryAcquire()]).toEqual([true, true, true, false]);
    expect(l.retryAfterMs()).toBe(1000);
    t = 1001;
    expect(l.tryAcquire()).toBe(true);
  });
  it("merges identical concurrent requests and caches for the TTL", async () => {
    let t = 0;
    const c = new CoalescingCache<number>(10_000, () => t);
    let calls = 0;
    const load = async () => ++calls;
    const [a, b] = await Promise.all([c.get("k", load), c.get("k", load)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    t = 5000;
    expect(await c.get("k", load)).toBe(1);
    t = 10_001;
    expect(await c.get("k", load)).toBe(2);
    expect(c.stale("k")).toBe(2);
  });
});

describe("Jupiter client", () => {
  const okBody = { inputMint: "a", outputMint: "b", inAmount: "100", outAmount: "50", router: "metis", requestId: "r" };
  const resp = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

  it("builds referral parameters only when both are present", () => {
    expect(buildOrderQuery({ inputMint: "a", outputMint: "b", amount: 5n })).toBe("inputMint=a&outputMint=b&amount=5");
    expect(buildOrderQuery({ inputMint: "a", outputMint: "b", amount: 5n, referralAccount: "R" })).not.toContain("referral");
    expect(buildOrderQuery({ inputMint: "a", outputMint: "b", amount: 5n, referralAccount: "R", referralFee: 50 })).toContain("referralAccount=R&referralFee=50");
  });

  it("caches and coalesces identical quotes", async () => {
    let n = 0;
    const c = new JupiterClient({ base: "https://x/swap/v2", fetchImpl: async () => (n++, resp(okBody)) });
    const p = { inputMint: "a", outputMint: "b", amount: 100n };
    await Promise.all([c.quote(p), c.quote(p), c.quote(p)]);
    await c.quote(p);
    expect(n).toBe(1);
  });

  it("stops calling when the local budget is spent", async () => {
    let n = 0;
    const c = new JupiterClient({ base: "https://x", fetchImpl: async () => (n++, resp(okBody)), cacheTtlMs: 0 });
    let refused = 0;
    for (let i = 0; i < 20; i++) {
      try {
        await c.quote({ inputMint: "a", outputMint: "b", amount: BigInt(i + 1) });
      } catch (e) {
        if ((e as { kind?: string }).kind === "rate-limited") refused++;
      }
    }
    expect(n).toBe(16);
    expect(refused).toBe(4);
  });

  it("honours a 429 and backs off", async () => {
    let n = 0;
    const c = new JupiterClient({ base: "https://x", fetchImpl: async () => (n++, resp({ error: "slow" }, 429, { "x-ratelimit-reset": "7" })), cacheTtlMs: 0 });
    await expect(c.quote({ inputMint: "a", outputMint: "b", amount: 1n })).rejects.toMatchObject({ kind: "rate-limited", retryAfterMs: 7000 });
    await expect(c.quote({ inputMint: "a", outputMint: "b", amount: 2n })).rejects.toMatchObject({ kind: "rate-limited" });
    expect(n).toBe(1);
  });

  it("rejects responses in an unexpected shape", async () => {
    const c = new JupiterClient({ base: "https://x", fetchImpl: async () => resp({ nope: true }) });
    await expect(c.quote({ inputMint: "a", outputMint: "b", amount: 1n })).rejects.toMatchObject({ kind: "bad-response" });
  });

  it("posts execute with the documented body", async () => {
    let body = "";
    const c = new JupiterClient({
      base: "https://x/swap/v2",
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe("https://x/swap/v2/execute");
        body = String(init?.body);
        return resp({ status: "Success", signature: "SIG", code: 0 });
      },
    });
    const r = await c.execute("B64", "REQ");
    expect(JSON.parse(body)).toEqual({ signedTransaction: "B64", requestId: "REQ" });
    expect(r.status).toBe("Success");
  });
});

describe("portfolio decoding", () => {
  it("decodes a little-endian u64", () => {
    const bytes = new Uint8Array([0x40, 0x42, 0x0f, 0, 0, 0, 0, 0]); // 1_000_000
    expect(decodeTokenAmount(btoa(String.fromCharCode(...bytes)))).toBe(1_000_000n);
  });
  it("reads the Scaled UI Amount extension from a parsed mint", () => {
    const cfg = scaledConfigFromMint({ parsed: { info: { extensions: [{ extension: "scaledUiAmountConfig", state: { multiplier: "1.008", newMultiplier: "1.01", newMultiplierEffectiveTimestamp: 123 } }] } } });
    expect(cfg).toEqual({ multiplier: 1.008, newMultiplier: 1.01, effectiveTimestamp: 123 });
    expect(scaledConfigFromMint({ parsed: { info: {} } })).toBeUndefined();
  });
});

describe("geo gate", () => {
  it("only allows trading when the region is proven allowed", () => {
    expect(canTrade({ kind: "allowed", country: "ID" })).toBe(true);
    expect(canTrade({ kind: "blocked", country: "US" })).toBe(false);
    expect(canTrade({ kind: "unknown", reason: "x" })).toBe(false);
    expect(canTrade(undefined)).toBe(false);
  });
});
