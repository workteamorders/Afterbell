import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, getAddress, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { erc20Abi, quoterV2Abi, swapRouter02Abi } from "../src/lib/evm/abi";
import { EVM_CHAINS, tradeTargets } from "../src/lib/evm/chains";
import { loadEvmLiquidity } from "../src/lib/evm/liquidity";
import { quoteExactIn } from "../src/lib/evm/quote";
import { buildApprove, buildSwap, explainEvmError, formatWei, minAmountOut, receiptSucceeded, receivedFromReceipt } from "../src/lib/evm/swap";
import { readAllowance, readDecimals, readErc20Balance } from "../src/lib/evm/tokens";
import { EVM_TOKENS, getEvmToken } from "../src/lib/registry";
import { evmTokensSchema } from "../src/lib/registry/evm-schema";
import raw from "../registry/evm-tokens.json";

const chain = EVM_CHAINS.ethereum;
const TAKER = "0x1111111111111111111111111111111111111111";

describe("EVM registry", () => {
  it("every address is a valid EIP-55 checksummed address", () => {
    for (const t of EVM_TOKENS) expect(getAddress(t.address), t.symbol).toBe(t.address);
    for (const a of [chain.usdc.address, chain.uniswapV3.quoterV2, chain.uniswapV3.swapRouter02, chain.uniswapV3.factory]) expect(getAddress(a)).toBe(a);
  });
  it("has no duplicate symbols or addresses, and every entry has a source and a check date", () => {
    expect(new Set(EVM_TOKENS.map((t) => t.symbol)).size).toBe(EVM_TOKENS.length);
    expect(new Set(EVM_TOKENS.map((t) => t.address.toLowerCase())).size).toBe(EVM_TOKENS.length);
    for (const t of EVM_TOKENS) {
      expect(t.addressSource.url).toMatch(/^https:\/\//);
      expect(t.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("rejects duplicates, bad addresses, and invented decimals", () => {
    const first = (raw as unknown[])[0] as Record<string, unknown>;
    expect(evmTokensSchema.safeParse([first, first]).success).toBe(false);
    expect(evmTokensSchema.safeParse([{ ...first, address: "0x123" }]).success).toBe(false);
    expect(evmTokensSchema.safeParse([{ ...first, decimals: 18 }]).success).toBe(false);
    expect(evmTokensSchema.safeParse([{ ...first, addressSource: undefined }]).success).toBe(false);
  });
  it("looks tokens up case-insensitively", () => {
    expect(getEvmToken("tslax")?.symbol).toBe("TSLAx");
    expect(getEvmToken("NOPE")).toBeUndefined();
  });
  it("targets only the SwapRouter02 for the geoblock", () => {
    expect(tradeTargets()).toEqual([chain.uniswapV3.swapRouter02.toLowerCase()]);
  });
});

describe("EVM calldata and amounts", () => {
  it("minAmountOut rounds down and clamps the tolerance", () => {
    expect(minAmountOut(1_000_000n, 50)).toBe(995_000n);
    expect(minAmountOut(999n, 50)).toBe(994n);
    expect(minAmountOut(1000n, 0)).toBe(1000n);
    expect(minAmountOut(1000n, 99_999)).toBe(0n);
    expect(minAmountOut(1000n, -5)).toBe(1000n);
  });
  it("approves the exact amount to the router, never unlimited", () => {
    const token = EVM_TOKENS[0]!.address;
    const c = buildApprove(chain, token, 12_345n);
    expect(c.to).toBe(token);
    const d = decodeFunctionData({ abi: erc20Abi, data: c.data });
    expect(d.functionName).toBe("approve");
    expect(d.args).toEqual([chain.uniswapV3.swapRouter02, 12_345n]);
  });
  it("wraps exactInputSingle in multicall(deadline) to the router with the taker as recipient", () => {
    const tok = EVM_TOKENS[0]!.address;
    const c = buildSwap(chain, { tokenIn: chain.usdc.address, tokenOut: tok, fee: 3000, recipient: TAKER, amountIn: 5_000_000n, amountOutMinimum: 777n, deadline: 1_900_000_000n });
    expect(c.to).toBe(chain.uniswapV3.swapRouter02);
    const outer = decodeFunctionData({ abi: swapRouter02Abi, data: c.data });
    expect(outer.functionName).toBe("multicall");
    const [deadline, calls] = outer.args as unknown as [bigint, `0x${string}`[]];
    expect(deadline).toBe(1_900_000_000n);
    expect(calls).toHaveLength(1);
    const inner = decodeFunctionData({ abi: swapRouter02Abi, data: calls[0]! });
    expect(inner.functionName).toBe("exactInputSingle");
    const p = (inner.args as unknown as [Record<string, unknown>])[0];
    expect(p).toMatchObject({ tokenIn: chain.usdc.address, tokenOut: tok, fee: 3000, recipient: TAKER, amountIn: 5_000_000n, amountOutMinimum: 777n, sqrtPriceLimitX96: 0n });
  });
  it("formats wei", () => {
    expect(formatWei(0n)).toBe("0");
    expect(formatWei(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatWei(1n)).toBe("<0.000001");
    expect(formatWei(123_456_789_000_000n)).toBe("0.000123");
  });
});

describe("EVM receipts", () => {
  const tok = EVM_TOKENS[0]!.address;
  const sel = toEventSelector("Transfer(address,address,uint256)");
  const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
  const log = (address: string, to: string, value: bigint) => ({ address, topics: [sel, pad("0x2222222222222222222222222222222222222222"), pad(to)], data: encodeAbiParameters([{ type: "uint256" }], [value]) });
  it("sums Transfer logs of the token to the taker only", () => {
    const receipt = { status: "0x1", logs: [log(tok, TAKER, 10n), log(tok, TAKER, 5n), log(tok, "0x3333333333333333333333333333333333333333", 99n), log(chain.usdc.address, TAKER, 1000n)] };
    expect(receivedFromReceipt(receipt, tok, TAKER)).toBe(15n);
    expect(receivedFromReceipt({ status: "0x1", logs: [] }, tok, TAKER)).toBeUndefined();
  });
  it("reads success from status", () => {
    expect(receiptSucceeded({ status: "0x1", logs: [] })).toBe(true);
    expect(receiptSucceeded({ status: "0x0", logs: [] })).toBe(false);
    expect(receiptSucceeded({ logs: [] })).toBe(false);
  });
});

describe("explainEvmError", () => {
  const ctx = { nativeSymbol: "ETH" };
  it.each([
    ["Too little received", /slippage tolerance/],
    ["insufficient funds for gas * price + value", /enough ETH/],
    ["execution reverted: STF", /balance or the approval/],
    ["Transaction too old", /expired/],
    ["execution reverted", /would fail/],
    ["???", /could not confirm/],
  ])("%s", (msg, re) => {
    const e = explainEvmError(msg, ctx);
    expect(e.what).toMatch(re);
    expect(e.safety).toMatch(/Nothing was sent/);
  });
});

/* ---- Jaringan dipalsukan: eth_call ke Quoter / token ---- */
type Rpc = { method: string; params: [{ to: string; data: string }] };
function fakeFetch(handler: (r: Rpc) => { result?: string; error?: string }): typeof fetch {
  return (async (_u: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Rpc & { id: number };
    const out = handler(body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...(out.error ? { error: { code: 3, message: out.error } } : { result: out.result }) }), { status: 200 });
  }) as typeof fetch;
}
const quoterResult = (amountOut: bigint) => encodeFunctionResult({ abi: quoterV2Abi, functionName: "quoteExactInputSingle", result: [amountOut, 0n, 0, 100_000n] });
const feeOf = (data: string) => {
  const d = decodeFunctionData({ abi: quoterV2Abi, data: data as `0x${string}` });
  return (d.args as unknown as [{ fee: number }])[0].fee;
};

describe("quoteExactIn", () => {
  const tok = EVM_TOKENS[0]!.address;
  it("picks the tier that pays the most and treats reverts as no pool", async () => {
    const fetchImpl = fakeFetch((r) => {
      const fee = feeOf(r.params[0].data);
      if (fee === 100) return { error: "execution reverted" };
      if (fee === 500) return { result: quoterResult(900n) };
      if (fee === 3000) return { result: quoterResult(950n) };
      return { result: quoterResult(0n) };
    });
    const q = await quoteExactIn(chain, chain.usdc.address, tok, 1_000n, undefined, { fetchImpl });
    expect(q?.fee).toBe(3000);
    expect(q?.amountOut).toBe(950n);
  });
  it("returns null when no pool can fill", async () => {
    const q = await quoteExactIn(chain, chain.usdc.address, tok, 1_000n, undefined, { fetchImpl: fakeFetch(() => ({ error: "execution reverted" })) });
    expect(q).toBeNull();
  });
  it("does not hide network failures as 'no pool'", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    await expect(quoteExactIn(chain, chain.usdc.address, tok, 1_000n, undefined, { fetchImpl })).rejects.toMatchObject({ kind: "network" });
  });
});

describe("token reads", () => {
  const tok = EVM_TOKENS[1]!.address;
  it("reads decimals from the contract once, and USDC from config", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      return { result: encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: 9 }) };
    });
    expect(await readDecimals(chain, tok, { fetchImpl })).toBe(9);
    expect(await readDecimals(chain, tok, { fetchImpl })).toBe(9);
    expect(calls).toBe(1);
    expect(await readDecimals(chain, chain.usdc.address, { fetchImpl })).toBe(6);
    expect(calls).toBe(1);
  });
  it("reads balance and allowance", async () => {
    const fetchImpl = fakeFetch((r) => {
      const d = decodeFunctionData({ abi: erc20Abi, data: r.params[0].data as `0x${string}` });
      return { result: encodeFunctionResult({ abi: erc20Abi, functionName: d.functionName as "balanceOf" | "allowance", result: d.functionName === "balanceOf" ? 42n : 7n }) };
    });
    expect(await readErc20Balance(chain, tok, TAKER, { fetchImpl })).toBe(42n);
    expect(await readAllowance(chain, tok, TAKER, chain.uniswapV3.swapRouter02, { fetchImpl })).toBe(7n);
  });
});

/** Token buatan dengan alamat unik, karena kuotasi dan decimals di-cache per alamat. */
const synthetic = (n: number) => ({ ...EVM_TOKENS[0]!, symbol: `T${n}x`, address: getAddress(`0x${n.toString(16).padStart(40, "0")}`) });

describe("loadEvmLiquidity", () => {
  const token = synthetic(101);
  const decimals = (d: number) => encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: d });

  const pool = (fills: (usd: number) => bigint | null) =>
    fakeFetch((r) => {
      const { to, data } = r.params[0];
      if (to.toLowerCase() === token.address.toLowerCase()) return { result: decimals(18) };
      const d = decodeFunctionData({ abi: quoterV2Abi, data: data as `0x${string}` });
      const p = (d.args as unknown as [{ amountIn: bigint; fee: number }])[0];
      if (p.fee !== 3000) return { error: "execution reverted" };
      const out = fills(Number(p.amountIn / 1_000_000n));
      return out === null ? { error: "execution reverted" } : { result: quoterResult(out) };
    });

  it("is ready with a Deep label when impact is tiny", async () => {
    // $1 = 1e18/100 token units → 100 USD buys 1e18 tokens at $100/token; slightly worse at size.
    const fetchImpl = pool((usd) => (BigInt(usd) * 10n ** 18n) / 100n - (BigInt(usd) * 10n ** 18n) / 100n / 10_000n);
    const r = await loadEvmLiquidity(chain, token, { fetchImpl });
    expect(r.state).toBe("ready");
    if (r.state === "ready") {
      expect(r.result.level).toBe("deep");
      expect(r.result.route).toBe("Uniswap v3");
      expect(r.fees).toEqual([3000]);
    }
  });
  it("reports Thin when large orders move the price a lot", async () => {
    const t = synthetic(102);
    const fetchImpl = fakeFetch((r) => {
      const { to, data } = r.params[0];
      if (to.toLowerCase() === t.address.toLowerCase()) return { result: decimals(18) };
      const p = (decodeFunctionData({ abi: quoterV2Abi, data: data as `0x${string}` }).args as unknown as [{ amountIn: bigint; fee: number }])[0];
      if (p.fee !== 500) return { error: "execution reverted" };
      const usd = Number(p.amountIn / 1_000_000n);
      const base = (BigInt(usd) * 10n ** 18n) / 100n;
      return { result: quoterResult(usd >= 10_000 ? (base * 90n) / 100n : base) };
    });
    const r = await loadEvmLiquidity(chain, t, { fetchImpl });
    expect(r.state === "ready" && r.result.level).toBe("thin");
  });
  it("says 'limited' with the sizes that could not be filled", async () => {
    const t = synthetic(103);
    const fetchImpl = fakeFetch((r) => {
      const { to, data } = r.params[0];
      if (to.toLowerCase() === t.address.toLowerCase()) return { result: decimals(18) };
      const p = (decodeFunctionData({ abi: quoterV2Abi, data: data as `0x${string}` }).args as unknown as [{ amountIn: bigint; fee: number }])[0];
      if (p.fee !== 3000) return { error: "execution reverted" };
      const usd = Number(p.amountIn / 1_000_000n);
      return usd > 100 ? { error: "execution reverted" } : { result: quoterResult(10n ** 18n) };
    });
    const r = await loadEvmLiquidity(chain, t, { fetchImpl });
    expect(r).toMatchObject({ state: "limited", filledUsd: [100], unfilledUsd: [1000, 10000] });
  });
  it("says 'limited' with nothing filled when there is no pool", async () => {
    const t = synthetic(104);
    const fetchImpl = fakeFetch((r) => (r.params[0].to.toLowerCase() === t.address.toLowerCase() ? { result: decimals(18) } : { error: "execution reverted" }));
    const r = await loadEvmLiquidity(chain, t, { fetchImpl });
    expect(r).toMatchObject({ state: "limited", filledUsd: [], unfilledUsd: [100, 1000, 10000] });
  });
  it("is unavailable when the network fails", async () => {
    const t = synthetic(105);
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    const r = await loadEvmLiquidity(chain, t, { fetchImpl });
    expect(r.state).toBe("unavailable");
  });
});
