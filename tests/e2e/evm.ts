import type { Page, Route } from "@playwright/test";
import { encodeAbiParameters, encodeFunctionResult, decodeFunctionData, toEventSelector } from "viem";
import { erc20Abi, quoterV2Abi } from "../../src/lib/evm/abi";
import { EVM_CHAINS } from "../../src/lib/evm/chains";

/**
 * Jaringan dan wallet EVM palsu untuk uji. Semua angka adalah DATA CONTOH: bukan harga, saldo, atau kolam nyata.
 * Tidak ada transaksi nyata yang dikirim; wallet tiruan hanya mengembalikan hash contoh.
 */
/** Alamat TSLAx dari registry/evm-tokens.json (ditulis di sini agar uji tidak mengimpor JSON). */
const TSLAX = "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0";
export const EVM_TEST_ADDRESS = "0x1111111111111111111111111111111111111111";
/** Hash contoh unik per transaksi yang "dikirim" wallet tiruan. */
export const txHash = (n: number) => "0x" + n.toString(16).padStart(64, "0");

export interface EvmMockOptions {
  country?: string;
  blocked?: boolean;
  /** Allowance awal (mentah) untuk router. 0 = perlu approval. */
  allowance?: bigint;
  /** Saldo mentah USDC (6 desimal) dan token (18 desimal). */
  usdc?: bigint;
  token?: bigint;
  /** Tidak ada kolam sama sekali. */
  noPool?: boolean;
  /** Simulasi swap (eth_call ke router) gagal dengan pesan ini. */
  simulateError?: string;
  /** Receipt swap berstatus gagal. */
  receiptFailed?: boolean;
}

export interface EvmCall {
  method: string;
  params: unknown[];
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

const TOKEN_DECIMALS = 18;
const ROUTER = EVM_CHAINS.ethereum.uniswapV3.swapRouter02.toLowerCase();
const QUOTER = EVM_CHAINS.ethereum.uniswapV3.quoterV2.toLowerCase();
const USDC = EVM_CHAINS.ethereum.usdc.address.toLowerCase();
const TRANSFER = toEventSelector("Transfer(address,address,uint256)");
const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;

export async function mockEvmNetwork(page: Page, o: EvmMockOptions = {}) {
  const calls: EvmCall[] = [];
  let allowance = o.allowance ?? 0n;
  const sent = new Map<string, "approve" | "swap">();

  await page.route("**/api/jup-free*", (r) => r.abort());
  await page.route("**/api.jup.ag/**", (r) => r.abort());
  await page.route("**/api/rpc", async (route) => {
    if (route.request().method() === "GET") return json(route, { country: o.country ?? "US", blocked: o.blocked ?? false });
    return json(route, { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } });
  });

  await page.route("**/api/rpc?chain=ethereum", async (route) => {
    const body = route.request().postDataJSON() as { id: unknown; method: string; params: unknown[] };
    calls.push({ method: body.method, params: body.params });
    const ok = (result: unknown) => json(route, { jsonrpc: "2.0", id: body.id, result });
    const err = (message: string) => json(route, { jsonrpc: "2.0", id: body.id, error: { code: 3, message } });
    switch (body.method) {
      case "eth_getBalance":
        return ok("0x" + (10n ** 18n).toString(16));
      case "eth_gasPrice":
        return ok("0x" + (20_000_000_000n).toString(16));
      case "eth_estimateGas":
        return ok("0x" + (150_000n).toString(16));
      case "eth_chainId":
        return ok("0x1");
      case "eth_getTransactionReceipt": {
        const kind = sent.get(String(body.params[0]));
        if (!kind) return ok(null);
        const logs = kind === "swap" ? [{ address: TSLAX, topics: [TRANSFER, pad(ROUTER), pad(EVM_TEST_ADDRESS)], data: encodeAbiParameters([{ type: "uint256" }], [400_000_000_000_000_000n]) }] : [];
        return ok({ status: kind === "swap" && o.receiptFailed ? "0x0" : "0x1", blockNumber: "0x10", gasUsed: "0x1", effectiveGasPrice: "0x1", logs });
      }
      case "eth_call": {
        const call = body.params[0] as { to: string; data: `0x${string}` };
        const to = call.to.toLowerCase();
        if (to === QUOTER) {
          if (o.noPool) return err("execution reverted");
          const d = decodeFunctionData({ abi: quoterV2Abi, data: call.data });
          const p = (d.args as unknown as [{ amountIn: bigint; fee: number }])[0];
          if (p.fee !== 3000) return err("execution reverted");
          // Contoh: 1 token = 250 USDC. Ukuran besar sedikit lebih buruk.
          const usd = Number(p.amountIn) / 1e6;
          const out = BigInt(Math.floor((usd / 250) * (1 - (0.00002 * usd) / 100) * 1e9)) * 10n ** 9n;
          return ok(encodeFunctionResult({ abi: quoterV2Abi, functionName: "quoteExactInputSingle", result: [out, 0n, 0, 100_000n] }));
        }
        if (to === ROUTER) {
          if (o.simulateError) return err(o.simulateError);
          return ok("0x" + "00".repeat(32));
        }
        const fn = decodeFunctionData({ abi: erc20Abi, data: call.data }).functionName;
        if (fn === "decimals") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: to === USDC ? 6 : TOKEN_DECIMALS }));
        if (fn === "balanceOf") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: to === USDC ? (o.usdc ?? 1_250_000_000n) : (o.token ?? 3_000_000_000_000_000_000n) }));
        if (fn === "allowance") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "allowance", result: allowance }));
        if (fn === "approve") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "approve", result: true }));
        return err("execution reverted");
      }
      default:
        return json(route, { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
    }
  });

  return {
    calls,
    /** Dipanggil wallet tiruan lewat page.exposeFunction saat transaksi dikirim. */
    onSend: (tx: { to: string; data: string }) => {
      const hash = txHash(sent.size + 1);
      if (tx.data.startsWith("0x095ea7b3")) {
        // approve(spender, amount): jumlah ada di 32 byte terakhir.
        allowance = BigInt("0x" + tx.data.slice(-64));
        sent.set(hash, "approve");
      } else sent.set(hash, "swap");
      return hash;
    },
  };
}

/** Wallet EIP-6963 tiruan. eth_sendTransaction dialihkan ke Node (tidak ada yang dikirim ke jaringan). */
export async function installFakeEvmWallet(page: Page, mock: { onSend: (tx: { to: string; data: string }) => string }, opts: { reject?: boolean; chainId?: string } = {}) {
  const sentTxs: Array<{ to: string; data: string }> = [];
  await page.exposeFunction("__evmSend", (tx: { to: string; data: string }) => {
    sentTxs.push(tx);
    return mock.onSend(tx);
  });
  await page.addInitScript(
    ({ address, reject, chainId }) => {
      let current = chainId;
      const provider = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [address];
            case "eth_chainId":
              return current;
            case "wallet_switchEthereumChain":
              current = (params?.[0] as { chainId: string }).chainId;
              return null;
            case "eth_sendTransaction": {
              if (reject) throw Object.assign(new Error("User rejected the request"), { code: 4001 });
              return (window as unknown as { __evmSend: (tx: unknown) => Promise<string> }).__evmSend((params as unknown[])[0]);
            }
            default:
              throw new Error(`Unsupported: ${method}`);
          }
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
      const info = { uuid: "test-evm-wallet", name: "Test EVM Wallet", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PC9zdmc+", rdns: "test.evm.wallet" };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { address: EVM_TEST_ADDRESS, reject: opts.reject ?? false, chainId: opts.chainId ?? "0x1" },
  );
  return sentTxs;
}
