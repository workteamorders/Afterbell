import { decodeAbiParameters, encodeFunctionData, toEventSelector } from "viem";
import type { FriendlyError } from "../swap";
import { erc20Abi, swapRouter02Abi } from "./abi";
import type { EvmChain } from "./chains";
import type { EvmReceipt } from "./rpc";

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

/** Persetujuan JUMLAH PAS (bukan tak terbatas) ke SwapRouter02. */
export function buildApprove(chain: EvmChain, token: string, amount: bigint): Call {
  return {
    to: token as `0x${string}`,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [chain.uniswapV3.swapRouter02, amount] }),
  };
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  recipient: string;
  amountIn: bigint;
  amountOutMinimum: bigint;
  /** Batas waktu (detik epoch). Di luar itu transaksi ditolak kontrak. */
  deadline: bigint;
}

/** SwapRouter02.multicall(deadline, [exactInputSingle(...)]). Penerima = wallet pengguna; tidak ada ETH yang dikirim. */
export function buildSwap(chain: EvmChain, p: SwapParams): Call {
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
export function explainEvmError(message: string, ctx: { nativeSymbol: string }): FriendlyError {
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
    return { what: "The pre-check shows the swap would fail on Ethereum.", safety: SAFE, next: "Refresh the quote and try again. If it keeps failing, try a smaller amount: the pool may be too small." };
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
