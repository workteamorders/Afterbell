import { afterEach, describe, expect, it, vi } from "vitest";
import { relaxHeaders } from "../scripts/dev-headers";
import { DEV_WALLET_RDNS, createDevWallet, devWalletIfEnabled } from "../src/lib/evm/dev-wallet";
import { watchEvmWallets } from "../src/lib/evm/wallet";

const ROBINHOOD = "0x1237";
const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TO = "0x8876789976dEcBfCbBbe364623C63652db8C0904";

function node(handler: (method: string, params: unknown[]) => unknown = () => "0xabc") {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    calls.push(b);
    const result = handler(b.method, b.params);
    return new Response(JSON.stringify(result instanceof Error ? { jsonrpc: "2.0", id: 1, error: { code: -32000, message: result.message } } : { jsonrpc: "2.0", id: 1, result }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const HASH = `0x${"ab".repeat(32)}`;
const tx = (over: Record<string, unknown> = {}) => ({ from: ACCOUNT, to: TO, data: "0x3593564c00", value: "0x0", ...over });

describe("dev wallet", () => {
  it("starts on another chain, so the switch flow is exercised", async () => {
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", ...node() });
    expect(await w.provider.request({ method: "eth_chainId" })).toBe("0x1");
    await w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD }] });
    expect(await w.provider.request({ method: "eth_chainId" })).toBe(ROBINHOOD);
    expect(w.info.rdns).toBe(DEV_WALLET_RDNS);
    expect(w.info.icon.startsWith("data:image/")).toBe(true);
  });

  it("refuses to switch to chains it cannot serve (4902), so the app falls back to wallet_addEthereumChain", async () => {
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", ...node() });
    await expect(w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] })).rejects.toMatchObject({ code: 4902 });
  });

  it("will not send a transaction while on another chain", async () => {
    const n = node();
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", confirmImpl: () => true, fetchImpl: n.fetchImpl });
    await expect(w.provider.request({ method: "eth_sendTransaction", params: [tx()] })).rejects.toMatchObject({ code: 4901 });
    expect(n.calls).toHaveLength(0);
  });

  it("asks for approval per transaction, counts them, and forwards only after OK", async () => {
    const n = node((m) => (m === "eth_sendTransaction" ? HASH : "0x0"));
    const messages: string[] = [];
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", startChainId: ROBINHOOD, fetchImpl: n.fetchImpl, confirmImpl: (m) => (messages.push(m), true) });
    expect(await w.provider.request({ method: "eth_sendTransaction", params: [tx({ data: "0x095ea7b3" + "00".repeat(64) })] })).toBe(HASH);
    expect(await w.provider.request({ method: "eth_sendTransaction", params: [tx()] })).toBe(HASH);
    expect(messages[0]).toContain("Transaction 1: ERC-20 approve");
    expect(messages[1]).toContain("Transaction 2: Universal Router swap");
    expect(n.calls.filter((c) => c.method === "eth_sendTransaction")).toHaveLength(2);
  });

  it("rejects with 4001 when the user cancels, and sends nothing", async () => {
    const n = node();
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", startChainId: ROBINHOOD, fetchImpl: n.fetchImpl, confirmImpl: () => false });
    await expect(w.provider.request({ method: "eth_sendTransaction", params: [tx()] })).rejects.toMatchObject({ code: 4001 });
    expect(n.calls).toHaveLength(0);
  });

  it("rejects malformed transactions and any from-address other than the dev account", async () => {
    const n = node();
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", startChainId: ROBINHOOD, fetchImpl: n.fetchImpl, confirmImpl: () => true });
    for (const bad of [tx({ from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }), tx({ to: "nope" }), tx({ data: "0xzz" }), tx({ value: "1" })]) {
      await expect(w.provider.request({ method: "eth_sendTransaction", params: [bad] })).rejects.toMatchObject({ code: -32602 });
    }
    expect(n.calls).toHaveLength(0);
  });

  it("forwards reads, and refuses everything else (no signing, no admin methods)", async () => {
    const n = node(() => "0x10");
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", fetchImpl: n.fetchImpl });
    expect(await w.provider.request({ method: "eth_getTransactionReceipt", params: [HASH] })).toBe("0x10");
    for (const m of ["personal_sign", "eth_sign", "eth_signTypedData_v4", "anvil_setBalance", "debug_traceTransaction", "eth_sendRawTransaction"]) {
      await expect(w.provider.request({ method: m, params: [] })).rejects.toMatchObject({ code: 4200 });
    }
    expect(n.calls.map((c) => c.method)).toEqual(["eth_getTransactionReceipt"]);
  });

  it("surfaces a clear message when the local node is down", async () => {
    const fetchImpl = (async () => new Response("", { status: 502 })) as unknown as typeof fetch;
    const w = createDevWallet({ rpcUrl: "http://127.0.0.1:8545", fetchImpl });
    await expect(w.provider.request({ method: "eth_blockNumber" })).rejects.toThrow(/pnpm fork/);
  });
});

describe("dev wallet gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const onHost = (hostname: string) => vi.stubGlobal("window", { location: { hostname }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} });

  it("is off without the build flag, even on localhost", () => {
    onHost("localhost");
    expect(devWalletIfEnabled()).toBeNull();
  });

  it("is off on a real host even with the flag", () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_WALLET", "1");
    onHost("afterbell.example");
    expect(devWalletIfEnabled()).toBeNull();
  });

  it("is off when the RPC is not a local address", () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_WALLET", "1");
    vi.stubEnv("NEXT_PUBLIC_DEV_RPC", "https://rpc.example.com");
    onHost("localhost");
    expect(devWalletIfEnabled()).toBeNull();
  });

  it("is on only with the flag, localhost, and a local RPC", () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_WALLET", "1");
    onHost("localhost");
    expect(devWalletIfEnabled()?.info.name).toMatch(/Dev wallet/);
  });

  it("appears in the wallet list only when enabled", () => {
    onHost("localhost");
    const none: unknown[][] = [];
    watchEvmWallets((w) => none.push(w))();
    expect(none).toHaveLength(0);
    vi.stubEnv("NEXT_PUBLIC_DEV_WALLET", "1");
    const some: Array<Array<{ info: { rdns: string } }>> = [];
    watchEvmWallets((w) => some.push(w as never))();
    expect(some.at(-1)?.map((w) => w.info.rdns)).toContain(DEV_WALLET_RDNS);
  });
});

describe("relaxHeaders (local preview only)", () => {
  const prod = "/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.jup.ag; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests\n  X-Frame-Options: DENY";
  it("adds the local node to connect-src and removes upgrade-insecure-requests", () => {
    const out = relaxHeaders(prod);
    expect(out).toContain("connect-src 'self' https://api.jup.ag http://127.0.0.1:8545;");
    expect(out).not.toContain("upgrade-insecure-requests");
    expect(out).toContain("X-Frame-Options: DENY");
  });
  it("is idempotent", () => {
    expect(relaxHeaders(relaxHeaders(prod))).toBe(relaxHeaders(prod));
  });
});
