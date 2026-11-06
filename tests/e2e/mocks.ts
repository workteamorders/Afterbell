import type { Page, Route } from "@playwright/test";

/**
 * Jaringan palsu untuk uji dan screenshot. SEMUA nilai di sini adalah DATA CONTOH untuk pengujian,
 * bukan harga atau saldo nyata. Mint dan alamat diambil dari registry; angka dibuat.
 */
export interface MockOptions {
  country?: string;
  blocked?: boolean;
  /** Impact per ukuran (persen, tambahan di atas harga dasar). */
  thin?: boolean;
  simulateError?: unknown;
  executeStatus?: "Success" | "Failed";
  noQuote?: boolean;
  /** Saldo mentah USDC (6 desimal) dan token (8 desimal). */
  usdc?: bigint;
  token?: bigint;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

function b64Amount(n: bigint): string {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(n);
  return bytes.toString("base64");
}

export async function mockNetwork(page: Page, o: MockOptions = {}) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  await page.route("**/api/jup-free*", (r) => r.abort());

  await page.route("**/api.jup.ag/swap/v2/order*", async (route) => {
    const u = new URL(route.request().url());
    calls.push({ url: route.request().url(), method: "GET" });
    if (o.noQuote) return json(route, { error: "no route", errorCode: 1, inAmount: "0", outAmount: "0", inputMint: "", outputMint: "" }, 400);
    const inAmount = BigInt(u.searchParams.get("amount") ?? "0");
    const taker = u.searchParams.get("taker");
    const inputMint = u.searchParams.get("inputMint") ?? "";
    const outputMint = u.searchParams.get("outputMint") ?? "";
    const buying = inputMint.startsWith("EPj");
    // Contoh: 1 token = 250 USDC. Ukuran besar sedikit lebih buruk.
    const usd = Number(inAmount) / 1e6;
    const slip = o.thin ? 0.0006 * usd ** 0.9 : 0.00002 * usd;
    const out = buying ? BigInt(Math.floor((usd / 250) * (1 - slip / 100) * 1e8)) : BigInt(Math.floor(Number(inAmount) / 1e8 * 250 * 1e6));
    return json(route, {
      inputMint,
      outputMint,
      inAmount: inAmount.toString(),
      outAmount: out.toString(),
      otherAmountThreshold: ((out * 995n) / 1000n).toString(),
      slippageBps: Number(u.searchParams.get("slippageBps") ?? 50),
      priceImpact: 0.01,
      router: "jupiterz",
      feeBps: u.searchParams.get("referralFee") ? Number(u.searchParams.get("referralFee")) : 0,
      referralAccount: u.searchParams.get("referralAccount") ?? undefined,
      signatureFeePayer: null,
      prioritizationFeeLamports: 5000,
      rentFeeLamports: 0,
      requestId: "mock-request",
      transaction: taker ? Buffer.from(new Uint8Array(1 + 64 + 40)).toString("base64") : undefined,
      routePlan: [{ swapInfo: { label: "JupiterZ" }, percent: 100 }],
    });
  });

  await page.route("**/api.jup.ag/swap/v2/execute", async (route) => {
    calls.push({ url: route.request().url(), method: "POST", body: route.request().postDataJSON() });
    if (o.executeStatus === "Failed") return json(route, { status: "Failed", code: -1, error: "Example failure", signature: "5".repeat(87) });
    return json(route, { status: "Success", signature: "4".repeat(87), code: 0, totalInputAmount: "100000000", totalOutputAmount: "39800000" });
  });

  await page.route("**/api/rpc", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return json(route, { country: o.country ?? "US", blocked: o.blocked ?? false });
    const body = req.postDataJSON() as { id: unknown; method: string; params?: unknown[] };
    calls.push({ url: req.url(), method: body.method, body });
    const ok = (result: unknown) => json(route, { jsonrpc: "2.0", id: body.id, result });
    switch (body.method) {
      case "getMultipleAccounts": {
        const keys = (body.params?.[0] ?? []) as string[];
        const cfg = (body.params?.[1] ?? {}) as { encoding?: string };
        const value = keys.map((_, i) => {
          if (cfg.encoding === "jsonParsed") return { data: { parsed: { info: { extensions: [] } } }, lamports: 1 };
          const amt = i === 0 ? (o.usdc ?? 1_250_000_000n) : (o.token ?? 150_000_000n);
          return { data: [b64Amount(amt), "base64"], lamports: 1 };
        });
        return ok({ context: { slot: 1 }, value });
      }
      case "getBalance":
        return ok({ context: { slot: 1 }, value: 42_000_000 });
      case "simulateTransaction":
        return ok({ context: { slot: 1 }, value: { err: o.simulateError ?? null, logs: [], unitsConsumed: 1 } });
      case "getSignatureStatuses":
        return ok({ context: { slot: 1 }, value: [{ confirmationStatus: "confirmed", err: null }] });
      default:
        return json(route, { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
    }
  });

  return calls;
}
