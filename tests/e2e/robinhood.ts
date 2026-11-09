import type { Page, Route } from "@playwright/test";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, toEventSelector } from "viem";
import { erc20Abi, permit2Abi, stateViewAbi, v4QuoterAbi } from "../../src/lib/evm/abi";
import { EVM_CHAINS } from "../../src/lib/evm/chains";
import { candidatePools, poolId } from "../../src/lib/evm/v4";
import { EVM_TEST_ADDRESS, txHash, type EvmCall } from "./evm";

/**
 * Robinhood Chain palsu untuk uji (Uniswap v4). Semua angka adalah DATA CONTOH: bukan harga, saldo, atau kolam nyata.
 * Tidak ada transaksi nyata yang dikirim.
 */
export const SPY_ADDRESS = "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C";
const RH = EVM_CHAINS.robinhood;
const UR = RH.uniswapV4.universalRouter.toLowerCase();
const QUOTER = RH.uniswapV4.quoter.toLowerCase();
const STATE_VIEW = RH.uniswapV4.stateView.toLowerCase();
const PERMIT2 = RH.uniswapV4.permit2.toLowerCase();
const USDG = RH.usd.address.toLowerCase();
const TRANSFER = toEventSelector("Transfer(address,address,uint256)");
const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

export interface RhMockOptions {
  country?: string;
  blocked?: boolean;
  /** Izin ERC-20 awal ke Permit2 (mentah). */
  erc20Allowance?: bigint;
  /** Izin Permit2 awal ke Universal Router (mentah) dan kedaluwarsanya (detik epoch). */
  permit2Amount?: bigint;
  permit2Expiration?: number;
  usdg?: bigint;
  token?: bigint;
  /** Tidak ada kolam hidup. */
  noPool?: boolean;
  simulateError?: string;
  /** Decimals USDG yang dilaporkan kontrak (default 6). */
  usdgDecimals?: number;
}

export async function mockRobinhoodNetwork(page: Page, o: RhMockOptions = {}) {
  const calls: EvmCall[] = [];
  let erc20Allowance = o.erc20Allowance ?? 0n;
  let permit2 = { amount: o.permit2Amount ?? 0n, expiration: o.permit2Expiration ?? 0 };
  const sent = new Map<string, "erc20-approve" | "permit2-approve" | "swap">();
  const livePool = poolId(candidatePools(RH, SPY_ADDRESS, RH.usd.address).find((k) => k.fee === 3000)!);

  await page.route("**/api/jup-free*", (r) => r.abort());
  await page.route("**/api.jup.ag/**", (r) => r.abort());
  await page.route("**/api/rpc", async (route) => {
    if (route.request().method() === "GET") return json(route, { country: o.country ?? "US", blocked: o.blocked ?? false });
    return json(route, { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } });
  });
  // Ethereum tidak dipakai di halaman Robinhood, tapi Portfolio/Explore bisa memintanya.
  await page.route("**/api/rpc?chain=ethereum", (route) => json(route, { jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted" } }));

  await page.route("**/api/rpc?chain=robinhood", async (route) => {
    const body = route.request().postDataJSON() as { id: unknown; method: string; params: unknown[] };
    calls.push({ method: body.method, params: body.params });
    const ok = (result: unknown) => json(route, { jsonrpc: "2.0", id: body.id, result });
    const err = (message: string) => json(route, { jsonrpc: "2.0", id: body.id, error: { code: 3, message } });
    switch (body.method) {
      case "eth_getBalance":
        return ok("0x" + (10n ** 18n).toString(16));
      case "eth_gasPrice":
        return ok("0x" + 100_000_000n.toString(16));
      case "eth_estimateGas":
        return ok("0x" + 250_000n.toString(16));
      case "eth_chainId":
        return ok("0x1237");
      case "eth_getTransactionReceipt": {
        const kind = sent.get(String(body.params[0]));
        if (!kind) return ok(null);
        const logs = kind === "swap" ? [{ address: SPY_ADDRESS, topics: [TRANSFER, pad(RH.uniswapV4.poolManager), pad(EVM_TEST_ADDRESS)], data: encodeAbiParameters([{ type: "uint256" }], [400_000_000_000_000_000n]) }] : [];
        return ok({ status: "0x1", blockNumber: "0x10", gasUsed: "0x1", effectiveGasPrice: "0x1", logs });
      }
      case "eth_call": {
        const call = body.params[0] as { to: string; data: `0x${string}` };
        const to = call.to.toLowerCase();
        if (to === STATE_VIEW) {
          const id = (decodeFunctionData({ abi: stateViewAbi, data: call.data }).args as [`0x${string}`])[0];
          const live = !o.noPool && id === livePool;
          return ok(encodeFunctionResult({ abi: stateViewAbi, functionName: "getLiquidity", result: live ? 10n ** 21n : 0n }));
        }
        if (to === QUOTER) {
          const p = (decodeFunctionData({ abi: v4QuoterAbi, data: call.data }).args as unknown as [{ poolKey: { fee: number }; zeroForOne: boolean; exactAmount: bigint }])[0];
          if (p.poolKey.fee !== 3000) return err("execution reverted");
          // Contoh: 1 token = 250 USDG. Ukuran besar sedikit lebih buruk. Beli: USDG masuk (6 desimal). Jual: token masuk (18 desimal).
          const buying = p.exactAmount < 10n ** 15n; // jumlah USDG mentah jauh lebih kecil dari jumlah token mentah
          const out = buying
            ? (() => {
                const usd = Number(p.exactAmount) / 1e6;
                return BigInt(Math.floor((usd / 250) * (1 - (0.00002 * usd) / 100) * 1e9)) * 10n ** 9n;
              })()
            : BigInt(Math.floor((Number(p.exactAmount) / 1e18) * 250 * 1e6));
          return ok(encodeFunctionResult({ abi: v4QuoterAbi, functionName: "quoteExactInputSingle", result: [out, 80_000n] }));
        }
        if (to === UR) {
          if (o.simulateError) return err(o.simulateError);
          return ok("0x");
        }
        if (to === PERMIT2) {
          const d = decodeFunctionData({ abi: permit2Abi, data: call.data });
          if (d.functionName === "allowance") return ok(encodeFunctionResult({ abi: permit2Abi, functionName: "allowance", result: [permit2.amount, permit2.expiration, 0] }));
          return ok("0x");
        }
        const fn = decodeFunctionData({ abi: erc20Abi, data: call.data }).functionName;
        if (fn === "decimals") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: to === USDG ? (o.usdgDecimals ?? 6) : 18 }));
        if (fn === "balanceOf") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: to === USDG ? (o.usdg ?? 1_250_000_000n) : (o.token ?? 3_000_000_000_000_000_000n) }));
        if (fn === "allowance") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "allowance", result: erc20Allowance }));
        if (fn === "approve") return ok(encodeFunctionResult({ abi: erc20Abi, functionName: "approve", result: true }));
        return err("execution reverted");
      }
      default:
        return json(route, { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
    }
  });

  return {
    calls,
    /** Dipanggil wallet tiruan saat transaksi "dikirim": mengubah keadaan izin seperti kontrak sungguhan. */
    onSend: (tx: { to: string; data: string }) => {
      const hash = txHash(sent.size + 1);
      const to = tx.to.toLowerCase();
      if (to === PERMIT2) {
        const d = decodeFunctionData({ abi: permit2Abi, data: tx.data as `0x${string}` });
        const [, , amount, expiration] = d.args as unknown as [string, string, bigint, number];
        permit2 = { amount, expiration };
        sent.set(hash, "permit2-approve");
      } else if (tx.data.startsWith("0x095ea7b3")) {
        erc20Allowance = BigInt("0x" + tx.data.slice(-64));
        sent.set(hash, "erc20-approve");
      } else sent.set(hash, "swap");
      return hash;
    },
  };
}
