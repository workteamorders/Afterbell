import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, toEventSelector } from "viem";
import type { FriendlyError } from "../swap";
import { erc20Abi, permit2Abi, swapRouter02Abi, universalRouterAbi } from "./abi";
import type { EvmChain, EvmChainV4 } from "./chains";
import type { EvmReceipt } from "./rpc";
import { isZeroForOne, type PoolKey } from "./v4";

/**
 * Logika murni swap EVM: pembentukan calldata, jumlah minimum, penerjemahan galat, dan pembacaan hasil dari receipt.
 * Tidak ada jaringan di sini, jadi bisa diuji penuh.
 */
export const BPS = 10_000n;

/** Jumlah minimum diterima = kuotasi dikurangi toleransi slippage (pembulatan ke bawah). */
export function minAmountOut(amountOut: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))));
  return (amountOut * (BPS - bps)) / BPS;
}

export interface Call {
  to: `0x${string}`;
  data: `0x${string}`;
}

/** Alamat yang diberi izin ERC-20: SwapRouter02 di v3, Permit2 di v4 (router v4 menarik token lewat Permit2). */
export function erc20Spender(chain: EvmChain): `0x${string}` {
  return chain.venue === "uniswap-v3" ? chain.uniswapV3.swapRouter02 : chain.uniswapV4.permit2;
}

/** Persetujuan ERC-20 JUMLAH PAS (bukan tak terbatas). v3: ke SwapRouter02. v4: ke Permit2. */
export function buildApprove(chain: EvmChain, token: string, amount: bigint): Call {
  return {
    to: token as `0x${string}`,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [erc20Spender(chain), amount] }),
  };
}

const MAX_UINT160 = 2n ** 160n - 1n;
const MAX_UINT48 = 2 ** 48 - 1;

/** Uniswap v4 saja: Permit2.approve(token, UniversalRouter, jumlah pas, kedaluwarsa singkat). */
export function buildPermit2Approve(chain: EvmChainV4, token: string, amount: bigint, expiration: number): Call {
  if (amount > MAX_UINT160) throw new Error("Amount is too large for Permit2.");
  if (!Number.isInteger(expiration) || expiration <= 0 || expiration > MAX_UINT48) throw new Error("Bad Permit2 expiration.");
  return {
    to: chain.uniswapV4.permit2,
    data: encodeFunctionData({ abi: permit2Abi, functionName: "approve", args: [token as `0x${string}`, chain.uniswapV4.universalRouter, amount, expiration] }),
  };
}

export interface ApprovalState {
  token: string;
  amount: bigint;
  /** Izin ERC-20 saat ini dari pengguna ke erc20Spender(chain). */
  erc20Allowance: bigint;
  /** Hanya v4: izin Permit2 saat ini dari pengguna ke UniversalRouter. */
  permit2?: { amount: bigint; expiration: number };
  nowSec: number;
  /** Izin Permit2 harus berlaku setidaknya sampai nowSec + ini, supaya tidak habis sebelum swap dikonfirmasi. */
  validForSec: number;
}

/** Daftar transaksi persetujuan yang masih dibutuhkan, urut. Kosong bila izin sudah cukup. */
export function planApprovals(chain: EvmChain, s: ApprovalState): Call[] {
  const calls: Call[] = [];
  if (s.erc20Allowance < s.amount) calls.push(buildApprove(chain, s.token, s.amount));
  if (chain.venue === "uniswap-v4") {
    const p = s.permit2;
    const fresh = p !== undefined && p.amount >= s.amount && p.expiration > s.nowSec + s.validForSec;
    if (!fresh) calls.push(buildPermit2Approve(chain, s.token, s.amount, s.nowSec + s.validForSec + 600));
  }
  return calls;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  /** Tingkat biaya (v3). Pada v4 biaya sudah ada di `pool`. */
  fee: number;
  /** Wajib untuk Uniswap v4. */
  pool?: PoolKey;
  recipient: string;
  amountIn: bigint;
  amountOutMinimum: bigint;
  /** Batas waktu (detik epoch). Di luar itu transaksi ditolak kontrak. */
  deadline: bigint;
}

/** Aksi v4-periphery: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL. Perintah Universal Router: V4_SWAP. */
const V4_ACTIONS = "0x060c0f" as const;
const V4_SWAP_COMMAND = "0x10" as const;

const POOL_KEY_TUPLE = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const;

/**
 * Struktur ExactInputSingleParams di Universal Router Robinhood Chain (4663) punya satu kolom di antara amountOutMinimum dan
 * hookData: minHopPriceX36 (harga minimum per lompatan, keluaran per masukan dikali 1e36; 0 = tidak dicek). Tanpa kolom ini
 * router membaca hookData dari posisi salah dan swap gagal tanpa pesan (diperiksa dengan eth_call di mainnet, D-069).
 * Batas jumlah minimum tetap dipaksa oleh amountOutMinimum dan TAKE_ALL.
 *
 * UniversalRouter.execute(V4_SWAP, [abi.encode(actions, params)], deadline). Token dibayar dari wallet lewat Permit2,
 * hasil dikirim ke pemanggil (TAKE_ALL ke msg.sender = wallet pengguna). Tidak ada ETH yang dikirim.
 */
function buildSwapV4(chain: EvmChainV4, p: SwapParams): Call {
  const pool = p.pool;
  if (!pool) throw new Error("A Uniswap v4 swap needs a pool.");
  const MAX128 = 2n ** 128n - 1n;
  if (p.amountIn > MAX128 || p.amountOutMinimum > MAX128) throw new Error("Amount is too large.");
  const swap = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", ...POOL_KEY_TUPLE },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "minHopPriceX36", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [{ poolKey: pool, zeroForOne: isZeroForOne(pool, p.tokenIn), amountIn: p.amountIn, amountOutMinimum: p.amountOutMinimum, minHopPriceX36: 0n, hookData: "0x" }],
  );
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [p.tokenIn as `0x${string}`, p.amountIn]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [p.tokenOut as `0x${string}`, p.amountOutMinimum]);
  const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [V4_ACTIONS, [swap, settle, take]]);
  return {
    to: chain.uniswapV4.universalRouter,
    data: encodeFunctionData({ abi: universalRouterAbi, functionName: "execute", args: [V4_SWAP_COMMAND, [input], p.deadline] }),
  };
}

/** Swap v3: SwapRouter02.multicall(deadline, [exactInputSingle]). Swap v4: lihat buildSwapV4. Penerima = wallet pengguna. */
export function buildSwap(chain: EvmChain, p: SwapParams): Call {
  if (chain.venue === "uniswap-v4") return buildSwapV4(chain, p);
  const inner = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: p.tokenIn as `0x${string}`,
        tokenOut: p.tokenOut as `0x${string}`,
        fee: p.fee,
        recipient: p.recipient as `0x${string}`,
        amountIn: p.amountIn,
        amountOutMinimum: p.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  return {
    to: chain.uniswapV3.swapRouter02,
    data: encodeFunctionData({ abi: swapRouter02Abi, functionName: "multicall", args: [p.deadline, [inner]] }),
  };
}

const TRANSFER = toEventSelector("Transfer(address,address,uint256)");

/** Jumlah token yang benar-benar diterima `to`, dibaca dari log Transfer pada receipt. undefined bila tidak ditemukan. */
export function receivedFromReceipt(receipt: EvmReceipt, token: string, to: string): bigint | undefined {
  let total = 0n;
  let found = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== TRANSFER.toLowerCase() || log.topics.length < 3) continue;
    const topicTo = log.topics[2];
    if (!topicTo || `0x${topicTo.slice(-40)}`.toLowerCase() !== to.toLowerCase()) continue;
    try {
      const [value] = decodeAbiParameters([{ type: "uint256" }], log.data as `0x${string}`);
      total += value;
      found = true;
    } catch {
      /* log tidak terbaca */
    }
  }
  return found ? total : undefined;
}

export function receiptSucceeded(receipt: EvmReceipt): boolean {
  return receipt.status !== undefined && BigInt(receipt.status) === 1n;
}

const SAFE = "Nothing was sent from your wallet.";

/** Menerjemahkan galat simulasi (eth_call/eth_estimateGas) menjadi bahasa jelas: apa, apakah dana aman, apa yang bisa dilakukan. */
export function explainEvmError(message: string, ctx: { nativeSymbol: string; chainName?: string }): FriendlyError {
  const m = message.toLowerCase();
  if (/too little received|slippage/.test(m)) {
    return { what: "The price moved more than your slippage tolerance allows.", safety: SAFE, next: "Refresh the quote, or raise the slippage tolerance a little and review again." };
  }
  if (/insufficient funds|gas required exceeds|exceeds allowance of the sender|intrinsic gas/.test(m)) {
    return { what: `Your wallet does not have enough ${ctx.nativeSymbol} to pay the network fee.`, safety: SAFE, next: `Add a little ${ctx.nativeSymbol}, then review again.` };
  }
  if (/\bstf\b|transfer amount exceeds|exceeds balance|insufficient allowance|transferfrom/.test(m)) {
    return { what: "The token transfer was refused: the balance or the approval is too low for this amount.", safety: SAFE, next: "Check your balance, approve the exact amount again, then review again." };
  }
  if (/deadline|expired|transaction too old/.test(m)) {
    return { what: "The quote expired before the check finished.", safety: SAFE, next: "Refresh the quote and review again." };
  }
  if (/revert|execution/.test(m)) {
    return { what: `The pre-check shows the swap would fail on ${ctx.chainName ?? "Ethereum"}.`, safety: SAFE, next: "Refresh the quote and try again. If it keeps failing, try a smaller amount: the pool may be too small." };
  }
  return { what: "The pre-check could not confirm that the swap will work.", safety: SAFE, next: "Try again in a moment." };
}

/** Biaya jaringan perkiraan dalam wei = gas × harga gas. */
export function networkFeeWei(gas: bigint, gasPrice: bigint): bigint {
  return gas * gasPrice;
}

/** Wei ke string ETH dengan paling banyak `maxFraction` desimal. */
export function formatWei(wei: bigint, maxFraction = 6): string {
  const base = 10n ** 18n;
  const whole = wei / base;
  let frac = (wei % base).toString().padStart(18, "0").slice(0, maxFraction).replace(/0+$/, "");
  if (frac === "" && wei > 0n && whole === 0n) return `<0.${"0".repeat(maxFraction - 1)}1`;
  return frac ? `${whole}.${frac}` : `${whole}`;
}
