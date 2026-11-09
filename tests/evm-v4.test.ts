import { decodeAbiParameters, decodeFunctionData, encodeFunctionResult, getAddress, keccak256, encodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { erc20Abi, permit2Abi, stateViewAbi, universalRouterAbi, v4QuoterAbi } from "../src/lib/evm/abi";
import { EVM_CHAINS, evmTokenPath, explorerTxBase, getEvmChain, routerAddress, tradeTargets, venueName } from "../src/lib/evm/chains";
import { loadEvmLiquidity } from "../src/lib/evm/liquidity";
import { quoteExactIn } from "../src/lib/evm/quote";
import { buildApprove, buildPermit2Approve, buildSwap, planApprovals } from "../src/lib/evm/swap";
import { verifyQuoteDecimals } from "../src/lib/evm/tokens";
import { candidatePools, isZeroForOne, NO_HOOKS, poolId, poolLabel, sortCurrencies, type PoolKey } from "../src/lib/evm/v4";
import { switchChain, type Eip1193Provider } from "../src/lib/evm/wallet";
import { EVM_TOKENS, ISSUERS, getEvmToken } from "../src/lib/registry";

const rh = EVM_CHAINS.robinhood;
const RH_TOKENS = EVM_TOKENS.filter((t) => t.chain === "robinhood");
const TAKER = "0x1111111111111111111111111111111111111111";
const STOCK = getEvmToken("SPY", "robinhood")!.address;

describe("Robinhood Chain config and registry", () => {
  it("has the official chain id and every address is EIP-55 checksummed", () => {
    expect(rh.chainId).toBe(4663);
    for (const a of [rh.usd.address, ...Object.values(rh.uniswapV4)]) expect(getAddress(a)).toBe(a);
    expect(rh.sources.every((s) => s.url.startsWith("https://"))).toBe(true);
  });
  it("lists Stock Tokens with checksummed addresses, a source, a check date and a known issuer", () => {
    expect(RH_TOKENS.length).toBeGreaterThan(90);
    const issuers = new Set(ISSUERS.map((i) => i.id));
    for (const t of RH_TOKENS) {
      expect(getAddress(t.address), t.symbol).toBe(t.address);
      expect(t.addressSource.url).toBe("https://api.robinhood.com/rhj/assets");
      expect(t.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(issuers.has(t.issuer)).toBe(true);
    }
    expect(new Set(RH_TOKENS.map((t) => t.address.toLowerCase())).size).toBe(RH_TOKENS.length);
  });
  it("issuer states the regional limit and rights honestly", () => {
    const i = ISSUERS.find((x) => x.id === "robinhood")!;
    expect(i.restrictsUsPersons).toBe(true);
    expect(i.rightsSummary).toMatch(/no legal or beneficial rights/i);
    expect(i.structure).toBe("debt-security");
  });
  it("never uses wording that Robinhood's terms disallow for Stock Tokens", () => {
    const text = JSON.stringify(ISSUERS.find((x) => x.id === "robinhood")) + JSON.stringify(RH_TOKENS);
    expect(text).not.toMatch(/tokenized stocks|tokenized equities|\bHood Chain/i);
  });
  it("helpers", () => {
    expect(venueName(rh)).toBe("Uniswap v4");
    expect(routerAddress(rh)).toBe(rh.uniswapV4.universalRouter);
    expect(getEvmChain("robinhood")).toBe(rh);
    expect(evmTokenPath({ chain: "robinhood", symbol: "SPY" })).toBe("/e/robinhood/SPY");
    expect(evmTokenPath({ chain: "ethereum", symbol: "TSLAx" })).toBe("/e/TSLAx");
    expect(explorerTxBase("robinhood")).toBe("https://robinhoodchain.blockscout.com/tx/");
    expect(tradeTargets()).toContain(rh.uniswapV4.universalRouter.toLowerCase());
  });
});

describe("Uniswap v4 pool keys", () => {
  it("sorts currencies numerically", () => {
    const a = "0x0000000000000000000000000000000000000002";
    const b = "0x0000000000000000000000000000000000000010";
    expect(sortCurrencies(b, a)).toEqual([a, b]);
    expect(sortCurrencies(a, b)).toEqual([a, b]);
  });
  it("computes pool ids as keccak256(abi.encode(poolKey))", () => {
    const key: PoolKey = { currency0: NO_HOOKS, currency1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", fee: 500, tickSpacing: 10, hooks: NO_HOOKS };
    const expected = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [key.currency0, key.currency1, 500, 10, NO_HOOKS]),
    );
    expect(poolId(key)).toBe(expected);
    // Id kolam ETH/USDC di Ethereum mainnet yang dikenal publik: 0,05% (tickSpacing 10) dan 0,30% (tickSpacing 60).
    expect(poolId(key)).toBe("0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27");
    expect(poolId({ ...key, fee: 3000, tickSpacing: 60 })).toBe("0xdce6394339af00981949f5f3baf27e3610c76326a700af57e4b3e3ae4977f78d");
  });
  it("builds the standard no-hook candidates, in sorted order, plus matching registry pools only", () => {
    const usd = rh.usd.address;
    const c = candidatePools(rh, STOCK, usd);
    expect(c).toHaveLength(rh.poolGrid.length);
    expect(c.every((k) => k.hooks === NO_HOOKS && BigInt(k.currency0) < BigInt(k.currency1))).toBe(true);
    const [c0, c1] = sortCurrencies(STOCK, usd);
    const extra = { currency0: c0, currency1: c1, fee: 2500, tickSpacing: 50, hooks: "0x00000000000000000000000000000000000000f1", source: { label: "x", url: "https://example.com" } };
    expect(candidatePools(rh, STOCK, usd, [extra])).toHaveLength(rh.poolGrid.length + 1);
    expect(candidatePools(rh, STOCK, usd, [{ ...extra, currency1: TAKER }])).toHaveLength(rh.poolGrid.length);
    expect(candidatePools(rh, STOCK, usd, [extra, extra])).toHaveLength(rh.poolGrid.length + 1);
  });
  it("labels pools and finds the swap direction", () => {
    const [c0, c1] = sortCurrencies(STOCK, rh.usd.address);
    const k: PoolKey = { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: NO_HOOKS };
    expect(poolLabel(k)).toBe("0.30% fee pool");
    expect(poolLabel({ ...k, hooks: "0x00000000000000000000000000000000000000f1" })).toMatch(/hook/);
    expect(isZeroForOne(k, c0)).toBe(true);
    expect(isZeroForOne(k, c1.toLowerCase())).toBe(false);
  });
});

describe("Uniswap v4 swap calldata", () => {
  const [c0, c1] = sortCurrencies(STOCK, rh.usd.address);
  const pool: PoolKey = { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: NO_HOOKS };

  function decode(call: { to: string; data: `0x${string}` }) {
    expect(call.to).toBe(rh.uniswapV4.universalRouter);
    const d = decodeFunctionData({ abi: universalRouterAbi, data: call.data });
    expect(d.functionName).toBe("execute");
    const [commands, inputs, deadline] = d.args as [`0x${string}`, `0x${string}`[], bigint];
    expect(commands).toBe("0x10");
    expect(inputs).toHaveLength(1);
    const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], inputs[0]!) as [`0x${string}`, `0x${string}`[]];
    const [swap] = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "poolKey", type: "tuple", components: [{ name: "c0", type: "address" }, { name: "c1", type: "address" }, { name: "fee", type: "uint24" }, { name: "ts", type: "int24" }, { name: "hooks", type: "address" }] },
            { name: "zeroForOne", type: "bool" },
            { name: "amountIn", type: "uint128" },
            { name: "amountOutMinimum", type: "uint128" },
            { name: "hookData", type: "bytes" },
          ],
        },
      ],
      params[0]!,
    );
    const settle = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], params[1]!);
    const take = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], params[2]!);
    return { actions, deadline, swap, settle, take, count: params.length };
  }

  it("encodes SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL for a buy (USDG in, stock out)", () => {
    const call = buildSwap(rh, { tokenIn: rh.usd.address, tokenOut: STOCK, fee: 3000, pool, recipient: TAKER, amountIn: 5_000_000n, amountOutMinimum: 777n, deadline: 1_900_000_000n });
    const r = decode(call);
    expect(r.actions).toBe("0x060c0f");
    expect(r.count).toBe(3);
    expect(r.deadline).toBe(1_900_000_000n);
    expect(r.swap.zeroForOne).toBe(isZeroForOne(pool, rh.usd.address));
    expect(r.swap.amountIn).toBe(5_000_000n);
    expect(r.swap.amountOutMinimum).toBe(777n);
    expect(r.swap.hookData).toBe("0x");
    expect(r.swap.poolKey.fee).toBe(3000);
    expect(r.settle).toEqual([rh.usd.address, 5_000_000n]);
    expect(r.take).toEqual([STOCK, 777n]);
  });
  it("flips the direction for a sell and sends no ETH", () => {
    const call = buildSwap(rh, { tokenIn: STOCK, tokenOut: rh.usd.address, fee: 3000, pool, recipient: TAKER, amountIn: 10n ** 18n, amountOutMinimum: 1n, deadline: 1n });
    const r = decode(call);
    expect(r.swap.zeroForOne).toBe(isZeroForOne(pool, STOCK));
    expect(r.settle[0]).toBe(STOCK);
    expect(r.take[0]).toBe(rh.usd.address);
    expect((call as { value?: string }).value).toBeUndefined();
  });
  it("requires a pool and refuses amounts that do not fit uint128", () => {
    expect(() => buildSwap(rh, { tokenIn: STOCK, tokenOut: rh.usd.address, fee: 3000, recipient: TAKER, amountIn: 1n, amountOutMinimum: 1n, deadline: 1n })).toThrow(/pool/);
    expect(() => buildSwap(rh, { tokenIn: STOCK, tokenOut: rh.usd.address, fee: 3000, pool, recipient: TAKER, amountIn: 2n ** 128n, amountOutMinimum: 1n, deadline: 1n })).toThrow(/too large/);
  });
});

describe("approvals", () => {
  const base = { token: STOCK, amount: 1_000n, nowSec: 1_000_000, validForSec: 1_200 };
  it("v4 approves Permit2 for the exact amount, then lets the router use exactly that amount for a short time", () => {
    const calls = planApprovals(rh, { ...base, erc20Allowance: 0n });
    expect(calls).toHaveLength(2);
    const a = decodeFunctionData({ abi: erc20Abi, data: calls[0]!.data });
    expect(calls[0]!.to).toBe(STOCK);
    expect(a.args).toEqual([rh.uniswapV4.permit2, 1_000n]);
    const b = decodeFunctionData({ abi: permit2Abi, data: calls[1]!.data });
    expect(calls[1]!.to).toBe(rh.uniswapV4.permit2);
    expect(b.args).toEqual([STOCK, rh.uniswapV4.universalRouter, 1_000n, 1_000_000 + 1_200 + 600]);
  });
  it("v4 skips what is already granted and refreshes an expiring or too-small Permit2 grant", () => {
    expect(planApprovals(rh, { ...base, erc20Allowance: 1_000n, permit2: { amount: 1_000n, expiration: 1_000_000 + 5_000 } })).toEqual([]);
    expect(planApprovals(rh, { ...base, erc20Allowance: 1_000n, permit2: { amount: 1_000n, expiration: 1_000_000 + 100 } })).toHaveLength(1);
    expect(planApprovals(rh, { ...base, erc20Allowance: 1_000n, permit2: { amount: 10n, expiration: 1_000_000 + 5_000 } })).toHaveLength(1);
    expect(planApprovals(rh, { ...base, erc20Allowance: 999n, permit2: { amount: 1_000n, expiration: 1_000_000 + 5_000 } })).toHaveLength(1);
  });
  it("v3 needs only the ERC-20 approval to the router", () => {
    const eth = EVM_CHAINS.ethereum;
    expect(planApprovals(eth, { ...base, erc20Allowance: 1_000n })).toEqual([]);
    const c = planApprovals(eth, { ...base, erc20Allowance: 0n });
    expect(c).toHaveLength(1);
    expect(decodeFunctionData({ abi: erc20Abi, data: c[0]!.data }).args).toEqual([eth.uniswapV3.swapRouter02, 1_000n]);
    expect(buildApprove(rh, STOCK, 5n).to).toBe(STOCK);
  });
  it("rejects Permit2 amounts and expirations that do not fit", () => {
    expect(() => buildPermit2Approve(rh, STOCK, 2n ** 160n, 10)).toThrow();
    expect(() => buildPermit2Approve(rh, STOCK, 1n, 0)).toThrow();
  });
});

/* ---- Jaringan dipalsukan ---- */
type Rpc = { method: string; params: [{ to: string; data: string }] };
function fakeFetch(handler: (r: Rpc) => { result?: string; error?: string }): typeof fetch {
  return (async (_u: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Rpc & { id: number };
    const out = handler(body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...(out.error ? { error: { code: 3, message: out.error } } : { result: out.result }) }), { status: 200 });
  }) as typeof fetch;
}
const addr = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const liquidityResult = (l: bigint) => encodeFunctionResult({ abi: stateViewAbi, functionName: "getLiquidity", result: l });
const quoteResult = (out: bigint) => encodeFunctionResult({ abi: v4QuoterAbi, functionName: "quoteExactInputSingle", result: [out, 50_000n] });
const decimalsResult = (d: number) => encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: d });

/** Jaringan v4 palsu: kolam dengan fee tertentu hidup; quoter menjawab sesuai fungsi. */
function v4Net(token: string, liveFees: number[], out: (usd: number, fee: number) => bigint | null, usdDecimals = 6) {
  const live = new Map<string, number>();
  for (const k of candidatePools(rh, token, rh.usd.address)) if (liveFees.includes(k.fee)) live.set(poolId(k), k.fee);
  return fakeFetch((r) => {
    const { to, data } = r.params[0];
    const t = to.toLowerCase();
    if (t === token.toLowerCase()) return { result: decimalsResult(18) };
    if (t === rh.usd.address.toLowerCase()) return { result: decimalsResult(usdDecimals) };
    if (t === rh.uniswapV4.stateView.toLowerCase()) {
      const id = (decodeFunctionData({ abi: stateViewAbi, data: data as `0x${string}` }).args as [`0x${string}`])[0];
      return { result: liquidityResult(live.has(id) ? 10n ** 18n : 0n) };
    }
    if (t === rh.uniswapV4.quoter.toLowerCase()) {
      const p = (decodeFunctionData({ abi: v4QuoterAbi, data: data as `0x${string}` }).args as unknown as [{ poolKey: PoolKey; zeroForOne: boolean; exactAmount: bigint }])[0];
      const usd = Number(p.exactAmount / 10n ** BigInt(usdDecimals));
      const o = out(usd, p.poolKey.fee);
      return o === null ? { error: "execution reverted" } : { result: quoteResult(o) };
    }
    return { error: "execution reverted" };
  });
}

describe("quoteExactIn on Uniswap v4", () => {
  it("quotes only live pools and picks the one that pays the most", async () => {
    const tok = addr(0x201);
    let quoterCalls = 0;
    const base = v4Net(tok, [500, 3000], (_u, fee) => (fee === 500 ? 900n : 950n));
    const fetchImpl = ((u: unknown, init?: RequestInit) => {
      if (String(init?.body).toLowerCase().includes(rh.uniswapV4.quoter.slice(2).toLowerCase())) quoterCalls++;
      return (base as (u: unknown, i?: RequestInit) => Promise<Response>)(u, init);
    }) as typeof fetch;
    const q = await quoteExactIn(rh, rh.usd.address, tok, 1_000_000n, undefined, { fetchImpl });
    expect(q?.fee).toBe(3000);
    expect(q?.amountOut).toBe(950n);
    expect(q?.pool?.fee).toBe(3000);
    expect(quoterCalls).toBe(2);
  });
  it("returns null when no standard pool has liquidity", async () => {
    const tok = addr(0x202);
    expect(await quoteExactIn(rh, rh.usd.address, tok, 1_000_000n, undefined, { fetchImpl: v4Net(tok, [], () => 1n) })).toBeNull();
  });
  it("treats a quoter revert as 'cannot fill' but surfaces network failures", async () => {
    const tok = addr(0x203);
    expect(await quoteExactIn(rh, rh.usd.address, tok, 1_000_000n, undefined, { fetchImpl: v4Net(tok, [3000], () => null) })).toBeNull();
    const down = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    await expect(quoteExactIn(rh, rh.usd.address, addr(0x204), 1_000_000n, undefined, { fetchImpl: down })).rejects.toMatchObject({ kind: "network" });
  });
});

describe("loadEvmLiquidity on Uniswap v4", () => {
  const mk = (n: number) => ({ ...RH_TOKENS[0]!, symbol: `Q${n}`, address: addr(n) });
  it("is ready and labelled Uniswap v4", async () => {
    const t = mk(0x301);
    const fetchImpl = v4Net(t.address, [3000], (usd) => (BigInt(usd) * 10n ** 18n) / 100n - (BigInt(usd) * 10n ** 18n) / 100n / 10_000n);
    const r = await loadEvmLiquidity(rh, t, { fetchImpl });
    expect(r.state).toBe("ready");
    if (r.state === "ready") {
      expect(r.result.level).toBe("deep");
      expect(r.result.route).toBe("Uniswap v4");
    }
  });
  it("says 'limited' with every size unfilled when there is no standard pool", async () => {
    const t = mk(0x302);
    const r = await loadEvmLiquidity(rh, t, { fetchImpl: v4Net(t.address, [], () => 1n) });
    expect(r).toMatchObject({ state: "limited", filledUsd: [], unfilledUsd: [100, 1000, 10000] });
  });
  it("refuses to quote when the dollar asset reports unexpected decimals", async () => {
    const t = mk(0x303);
    const odd = { ...rh, usd: { ...rh.usd, address: addr(0x999) } };
    const fetchImpl = fakeFetch((r) => ((r.params[0].to.toLowerCase() === odd.usd.address.toLowerCase() || r.params[0].to.toLowerCase() === t.address.toLowerCase()) ? { result: decimalsResult(18) } : { error: "execution reverted" }));
    const r = await loadEvmLiquidity(odd, t, { fetchImpl });
    expect(r.state).toBe("unavailable");
    expect(r.state === "unavailable" && r.reason).toMatch(/decimals/);
  });
  it("verifies configured decimals only when the source did not state them", async () => {
    await expect(verifyQuoteDecimals(EVM_CHAINS.ethereum)).resolves.toBeUndefined();
  });
});

describe("switchChain", () => {
  const add = { chainName: "Robinhood Chain", rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"], nativeSymbol: "ETH" };
  const provider = (switchError?: unknown) => {
    const calls: Array<{ method: string; params?: unknown[] }> = [];
    const p: Eip1193Provider = {
      async request(args) {
        calls.push(args);
        if (args.method === "wallet_switchEthereumChain" && switchError) throw switchError;
        return null;
      },
    };
    return { p, calls };
  };
  it("just switches when the wallet knows the chain", async () => {
    const { p, calls } = provider();
    await switchChain(p, 4663, add);
    expect(calls.map((c) => c.method)).toEqual(["wallet_switchEthereumChain"]);
    expect(calls[0]!.params).toEqual([{ chainId: "0x1237" }]);
  });
  it("asks the wallet to add an unknown chain with the official parameters", async () => {
    const { p, calls } = provider(Object.assign(new Error("Unrecognized chain ID"), { code: 4902 }));
    await switchChain(p, 4663, add);
    expect(calls.map((c) => c.method)).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain"]);
    expect(calls[1]!.params).toEqual([
      { chainId: "0x1237", chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: add.rpcUrls, blockExplorerUrls: add.blockExplorerUrls },
    ]);
  });
  it("does not add a chain when the user rejected the switch or no parameters are known", async () => {
    const rejected = provider(Object.assign(new Error("User rejected"), { code: 4001 }));
    await expect(switchChain(rejected.p, 4663, add)).rejects.toThrow(/rejected/);
    expect(rejected.calls).toHaveLength(1);
    const unknown = provider(Object.assign(new Error("Unrecognized chain ID"), { code: 4902 }));
    await expect(switchChain(unknown.p, 1)).rejects.toThrow();
    expect(unknown.calls).toHaveLength(1);
  });
});
