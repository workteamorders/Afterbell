import { beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_METHODS, handleRpc, resetBuckets, type RpcEnv } from "../src/server/rpc-handler";

const ORIGIN = "https://afterbell.example";
const URL_ = `${ORIGIN}/api/rpc`;
const env: RpcEnv = { RPC_UPSTREAM_URL: "https://upstream.invalid/SECRET-KEY", BLOCKED_COUNTRIES: "KP, IR" };

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": "1.2.3.4", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
const rpc = (method: string, params: unknown[] = ["x"], id: number | string = 1) => ({ jsonrpc: "2.0", id, method, params });

const upstreamOk = async (_u: unknown, init?: RequestInit) => {
  const sent = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: { echoed: sent.method } }), { status: 200 });
};

beforeEach(() => resetBuckets());

describe("/api/rpc allowlist", () => {
  it("forwards every allowed method", async () => {
    for (const m of ALLOWED_METHODS) {
      const params = m === "getMultipleAccounts" || m === "getSignatureStatuses" ? [["a"]] : ["x"];
      const res = await handleRpc(post(rpc(m, params)), env, { fetchImpl: upstreamOk as typeof fetch });
      expect(res.status, m).toBe(200);
      expect(((await res.json()) as { result: { echoed: string } }).result.echoed).toBe(m);
    }
  });

  it.each(["getProgramAccounts", "getTokenAccountsByOwner", "getTokenAccountsByDelegate", "requestAirdrop", "getTransaction", "getBlock", "anything"])("rejects %s", async (m) => {
    let called = false;
    const res = await handleRpc(post(rpc(m)), env, { fetchImpl: (async () => ((called = true), new Response("{}"))) as typeof fetch });
    expect(res.status).toBe(403);
    expect(called).toBe(false);
    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32601);
  });

  it("rejects batches", async () => {
    const res = await handleRpc(post([rpc("getBalance")]), env, { fetchImpl: upstreamOk as typeof fetch });
    expect(res.status).toBe(400);
  });

  it("rejects config keys outside the allowlist and oversized address lists", async () => {
    expect((await handleRpc(post(rpc("getBalance", ["x", { filters: [] }])), env, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `a${i}`);
    expect((await handleRpc(post(rpc("getMultipleAccounts", [many])), env, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(400);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    expect((await handleRpc(post("{nope"), env)).status).toBe(400);
    expect((await handleRpc(post(JSON.stringify(rpc("getBalance", ["x".repeat(20_000)]))), env)).status).toBe(413);
  });
});

describe("/api/rpc origin and CORS", () => {
  it("rejects an origin that is not allowed", async () => {
    const res = await handleRpc(post(rpc("getBalance"), { origin: "https://evil.example" }), env, { fetchImpl: upstreamOk as typeof fetch });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("rejects requests with no Origin header (non-browser clients)", async () => {
    const req = new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rpc("getBalance")) });
    expect((await handleRpc(req, env)).status).toBe(403);
  });
  it("allows same-origin and listed origins, and reflects only those", async () => {
    const same = await handleRpc(post(rpc("getBalance")), env, { fetchImpl: upstreamOk as typeof fetch });
    expect(same.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const listed = await handleRpc(post(rpc("getBalance"), { origin: "https://preview.example" }), { ...env, ALLOWED_ORIGINS: "https://preview.example" }, { fetchImpl: upstreamOk as typeof fetch });
    expect(listed.status).toBe(200);
  });
  it("answers preflight only for allowed origins", async () => {
    const ok = await handleRpc(new Request(URL_, { method: "OPTIONS", headers: { origin: ORIGIN } }), env);
    expect(ok.status).toBe(204);
    const no = await handleRpc(new Request(URL_, { method: "OPTIONS", headers: { origin: "https://evil.example" } }), env);
    expect(no.status).toBe(403);
  });
});

describe("/api/rpc rate limit", () => {
  it("returns 429 after the per-IP budget is spent and recovers over time", async () => {
    const small = { ...env, RATE_LIMIT_PER_MINUTE: "3" };
    let t = 0;
    const deps = { fetchImpl: upstreamOk as typeof fetch, now: () => t };
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await handleRpc(post(rpc("getBalance")), small, deps)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    t = 30_000;
    expect((await handleRpc(post(rpc("getBalance")), small, deps)).status).toBe(200);
  });
  it("limits per IP, not globally", async () => {
    const small = { ...env, RATE_LIMIT_PER_MINUTE: "1" };
    const deps = { fetchImpl: upstreamOk as typeof fetch, now: () => 0 };
    expect((await handleRpc(post(rpc("getBalance"), { "cf-connecting-ip": "9.9.9.9" }), small, deps)).status).toBe(200);
    expect((await handleRpc(post(rpc("getBalance"), { "cf-connecting-ip": "9.9.9.9" }), small, deps)).status).toBe(429);
    expect((await handleRpc(post(rpc("getBalance"), { "cf-connecting-ip": "8.8.8.8" }), small, deps)).status).toBe(200);
  });
  it("uses the Rate Limiting binding when present", async () => {
    const res = await handleRpc(post(rpc("getBalance")), { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } }, { fetchImpl: upstreamOk as typeof fetch });
    expect(res.status).toBe(429);
  });
});

describe("/api/rpc geoblock", () => {
  it("GET reports the country from the Cloudflare header and whether it is blocked", async () => {
    const mk = (c?: string) => new Request(URL_, { method: "GET", headers: c ? { "cf-ipcountry": c } : {} });
    expect(await (await handleRpc(mk("KP"), env)).json()).toEqual({ country: "KP", blocked: true });
    expect(await (await handleRpc(mk("id"), env)).json()).toEqual({ country: "ID", blocked: false });
    expect(await (await handleRpc(mk(), env)).json()).toEqual({ country: null, blocked: false });
    expect(await (await handleRpc(mk("XX9"), env)).json()).toEqual({ country: null, blocked: false });
  });
  it("blocks simulate and send from blocked countries but still serves reads", async () => {
    const h = { "cf-ipcountry": "IR" };
    expect((await handleRpc(post(rpc("simulateTransaction"), h), env, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(403);
    expect((await handleRpc(post(rpc("sendTransaction"), h), env, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(403);
    expect((await handleRpc(post(rpc("getBalance"), h), env, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(200);
  });
});

describe("/api/rpc upstream handling", () => {
  it("is not configured without RPC_UPSTREAM_URL (no silent default in production)", async () => {
    const res = await handleRpc(post(rpc("getBalance")), {}, { fetchImpl: upstreamOk as typeof fetch });
    expect(res.status).toBe(503);
  });
  it("uses the dev default only when explicitly allowed", async () => {
    let url = "";
    await handleRpc(post(rpc("getBalance")), { ALLOW_DEFAULT_UPSTREAM: "1" }, { fetchImpl: (async (u: string) => ((url = u), new Response('{"jsonrpc":"2.0","id":1,"result":1}'))) as unknown as typeof fetch });
    expect(url).toContain("publicnode");
  });
  it("never leaks the upstream URL or key in responses", async () => {
    const res = await handleRpc(post(rpc("getBalance")), env, { fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/SECRET-KEY|upstream\.invalid/);
    const timeout = await handleRpc(post(rpc("getBalance")), env, { fetchImpl: (async () => { throw new Error("https://upstream.invalid/SECRET-KEY boom"); }) as typeof fetch });
    expect(timeout.status).toBe(504);
    expect(await timeout.text()).not.toMatch(/SECRET-KEY/);
  });
  it("maps upstream 429 to 429", async () => {
    const res = await handleRpc(post(rpc("getBalance")), env, { fetchImpl: (async () => new Response("", { status: 429 })) as typeof fetch });
    expect(res.status).toBe(429);
  });
});

/* ---------------- Mode EVM (?chain=ethereum) ---------------- */
import { EVM_ALLOWED_METHODS, validateEvmParams, isEvmTradeCall } from "../src/server/rpc-handler";
import { EVM_CHAINS } from "../src/lib/evm/chains";

const ETH_URL = `${ORIGIN}/api/rpc?chain=ethereum`;
function postEvm(body: unknown, headers: Record<string, string> = {}, url = ETH_URL): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": "1.2.3.4", ...headers }, body: JSON.stringify(body) });
}
const ADDR = "0x" + "11".repeat(20);
const ROUTER = EVM_CHAINS.ethereum.uniswapV3.swapRouter02;
const QUOTER = EVM_CHAINS.ethereum.uniswapV3.quoterV2;
const evmEnv: RpcEnv = { ...env, EVM_RPC_UPSTREAM_URL_ETHEREUM: "https://eth-upstream.invalid/SECRET-ETH-KEY" };
const callParams = (to: string) => [{ to, data: "0x1234", from: ADDR }, "latest"];

describe("/api/rpc EVM mode", () => {
  it("uses the Ethereum upstream, never the Solana one", async () => {
    let url = "";
    const f = (async (u: string) => ((url = u), new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}'))) as unknown as typeof fetch;
    expect((await handleRpc(postEvm(rpc("eth_chainId", [])), evmEnv, { fetchImpl: f })).status).toBe(200);
    expect(url).toBe("https://eth-upstream.invalid/SECRET-ETH-KEY");
  });
  it("forwards every allowed EVM method with valid params", async () => {
    const params: Record<string, unknown[]> = {
      eth_call: callParams(QUOTER),
      eth_getBalance: [ADDR, "latest"],
      eth_blockNumber: [],
      eth_chainId: [],
      eth_estimateGas: [{ to: QUOTER, data: "0x12", from: ADDR }],
      eth_gasPrice: [],
      eth_getTransactionReceipt: ["0x" + "ab".repeat(32)],
    };
    for (const m of EVM_ALLOWED_METHODS) {
      const res = await handleRpc(postEvm(rpc(m, params[m])), evmEnv, { fetchImpl: upstreamOk as typeof fetch });
      expect(res.status, m).toBe(200);
    }
  });
  it.each(["eth_sendRawTransaction", "eth_sendTransaction", "eth_getLogs", "eth_accounts", "debug_traceCall", "getBalance", "personal_sign"])("rejects %s", async (m) => {
    let called = false;
    const res = await handleRpc(postEvm(rpc(m, [])), evmEnv, { fetchImpl: (async () => ((called = true), new Response("{}"))) as typeof fetch });
    expect(res.status).toBe(403);
    expect(called).toBe(false);
  });
  it("rejects Solana methods in EVM mode and EVM methods in Solana mode", async () => {
    expect((await handleRpc(postEvm(rpc("getBalance", ["x"])), evmEnv, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(403);
    expect((await handleRpc(post(rpc("eth_chainId", [])), evmEnv, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(403);
  });
  it("rejects an unknown chain", async () => {
    const res = await handleRpc(postEvm(rpc("eth_chainId", []), {}, `${URL_}?chain=bogus`), evmEnv, { fetchImpl: upstreamOk as typeof fetch });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32602);
  });
  it("validates params", () => {
    expect(validateEvmParams("eth_call", callParams(QUOTER))).toBeNull();
    expect(validateEvmParams("eth_call", [{ to: QUOTER, gasPrice: "0x1" }, "latest"])).toMatch(/not allowed/);
    expect(validateEvmParams("eth_call", [{ to: "0x12", data: "0x" }, "latest"])).toMatch(/address/);
    expect(validateEvmParams("eth_call", [{ to: QUOTER, data: "zz" }, "latest"])).toMatch(/hex/);
    expect(validateEvmParams("eth_call", [{ to: QUOTER, data: "0x" + "ab".repeat(5000) }, "latest"])).toMatch(/too large/);
    expect(validateEvmParams("eth_call", [{ to: QUOTER }, "pending"])).toMatch(/Block tag/);
    expect(validateEvmParams("eth_call", [{ data: "0x" }, "latest"])).toMatch(/to address/);
    expect(validateEvmParams("eth_call", ["0x"])).toMatch(/call object/);
    expect(validateEvmParams("eth_getBalance", ["nope"])).toMatch(/address/);
    expect(validateEvmParams("eth_getTransactionReceipt", ["0x12"])).toMatch(/hash/);
    expect(validateEvmParams("eth_chainId", [1])).toMatch(/no parameters/);
  });
  it("treats estimateGas and router calls as trade calls", () => {
    expect(isEvmTradeCall("eth_estimateGas", [{ to: QUOTER }])).toBe(true);
    expect(isEvmTradeCall("eth_call", callParams(ROUTER))).toBe(true);
    expect(isEvmTradeCall("eth_call", callParams(ROUTER.toLowerCase()))).toBe(true);
    expect(isEvmTradeCall("eth_call", callParams(QUOTER))).toBe(false);
    expect(isEvmTradeCall("eth_getBalance", [ADDR])).toBe(false);
  });
  it("blocks simulation of trades from blocked countries but still serves reads and quotes", async () => {
    const h = { "cf-ipcountry": "IR" };
    const f = { fetchImpl: upstreamOk as typeof fetch };
    expect((await handleRpc(postEvm(rpc("eth_estimateGas", [{ to: QUOTER, data: "0x12" }]), h), evmEnv, f)).status).toBe(403);
    expect((await handleRpc(postEvm(rpc("eth_call", callParams(ROUTER)), h), evmEnv, f)).status).toBe(403);
    expect((await handleRpc(postEvm(rpc("eth_call", callParams(QUOTER)), h), evmEnv, f)).status).toBe(200);
    expect((await handleRpc(postEvm(rpc("eth_getBalance", [ADDR, "latest"]), h), evmEnv, f)).status).toBe(200);
  });
  it("is not configured without the Ethereum upstream, and the dev default needs an explicit flag", async () => {
    expect((await handleRpc(postEvm(rpc("eth_chainId", [])), env, { fetchImpl: upstreamOk as typeof fetch })).status).toBe(503);
    let url = "";
    await handleRpc(postEvm(rpc("eth_chainId", [])), { ALLOW_DEFAULT_UPSTREAM: "1" }, { fetchImpl: (async (u: string) => ((url = u), new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}'))) as unknown as typeof fetch });
    expect(url).toContain("publicnode");
  });
  it("never leaks the Ethereum upstream key", async () => {
    const res = await handleRpc(postEvm(rpc("eth_chainId", [])), evmEnv, { fetchImpl: (async () => { throw new Error("https://eth-upstream.invalid/SECRET-ETH-KEY"); }) as typeof fetch });
    expect(res.status).toBe(504);
    expect(await res.text()).not.toMatch(/SECRET-ETH-KEY/);
  });
});
