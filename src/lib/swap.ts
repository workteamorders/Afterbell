import type { Order } from "./jupiter";
import type { Simulation } from "./rpc";

/**
 * Logika murni alur swap: terjemahan galat simulasi ke bahasa jelas, ringkasan biaya jaringan, dan pemeriksaan order.
 * Setiap galat menjelaskan: apa yang terjadi, apakah dana aman, dan apa yang bisa dilakukan.
 */
export interface FriendlyError {
  what: string;
  safety: string;
  next: string;
}

const SAFE = "Nothing was sent from your wallet.";

function logsInclude(logs: readonly string[] | null | undefined, ...needles: string[]): boolean {
  const text = (logs ?? []).join("\n").toLowerCase();
  return needles.some((n) => text.includes(n.toLowerCase()));
}

export function explainSimulationError(sim: Pick<Simulation, "err" | "logs">): FriendlyError | null {
  const { err, logs } = sim;
  if (err === null || err === undefined) return null;

  if (typeof err === "string") {
    switch (err) {
      case "BlockhashNotFound":
        return { what: "The quote expired before the check finished.", safety: SAFE, next: "Refresh the quote and review again." };
      case "AccountNotFound":
        return {
          what: "Your wallet has no SOL for the network fee, or an account the swap needs does not exist.",
          safety: SAFE,
          next: "Add a small amount of SOL to your wallet, then review again.",
        };
      case "InsufficientFundsForFee":
        return { what: "Your wallet does not have enough SOL to pay the network fee.", safety: SAFE, next: "Add a small amount of SOL, then review again." };
      case "InsufficientFundsForRent":
        return { what: "The swap needs a little SOL to open a token account, and your wallet does not have enough.", safety: SAFE, next: "Add a small amount of SOL, then review again." };
      case "AlreadyProcessed":
        return { what: "This exact transaction was already processed.", safety: "Check your wallet history before trying again.", next: "Open the explorer link in your history to confirm." };
      default:
        break;
    }
  }

  if (logsInclude(logs, "slippage tolerance exceeded", "slippageexceeded", "exceeded desired slippage")) {
    return {
      what: "The price moved more than your slippage tolerance allows.",
      safety: SAFE,
      next: "Refresh the quote, or raise the slippage tolerance a little and review again.",
    };
  }
  if (logsInclude(logs, "insufficient funds", "insufficient lamports", "0x1\n") || (typeof err === "object" && JSON.stringify(err).includes('"Custom":1}'))) {
    return {
      what: "Your wallet balance is too low for this swap and its fees.",
      safety: SAFE,
      next: "Lower the amount, or add funds, then review again.",
    };
  }
  if (logsInclude(logs, "frozen", "account is frozen")) {
    return {
      what: "A token account involved in this swap is frozen by the token's issuer.",
      safety: SAFE,
      next: "This swap cannot go through. Check the issuer's terms on the token page.",
    };
  }
  return {
    what: "The pre-check (simulation) of this swap failed, so Afterbell did not ask your wallet to sign.",
    safety: SAFE,
    next: "Refresh the quote and try again. If it keeps failing, try a smaller amount.",
  };
}

export interface NetworkFee {
  lamports: number;
  /** true bila pihak lain (bukan taker) membayar biaya tanda tangan. */
  sponsored: boolean;
}

export function networkFee(order: Order, taker: string): NetworkFee {
  const sig = order.signatureFeeLamports ?? 0;
  const prio = order.prioritizationFeeLamports ?? 0;
  const rent = order.rentFeeLamports ?? 0;
  const sponsored = order.signatureFeePayer != null && order.signatureFeePayer !== taker;
  return { lamports: sponsored ? Math.max(0, prio + rent) : sig + prio + rent, sponsored };
}

export function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Order bertaker valid bila ada transaksi dan tidak ada errorCode. */
export function orderProblem(order: Order): FriendlyError | null {
  if (order.transaction) return null;
  const code = order.errorCode;
  const router = order.router;
  if (code !== undefined) {
    const aggregator = router === "metis" || router === "dflow" || router === "okx";
    if (aggregator && code === 1) return { what: "Your wallet balance is too low for this swap.", safety: SAFE, next: "Lower the amount or add funds." };
    if (aggregator && code === 2) return { what: "Your wallet does not have enough SOL for the network fee.", safety: SAFE, next: "Add a small amount of SOL, then try again." };
    if (aggregator && code === 3) return { what: "This swap is too small to go through.", safety: SAFE, next: "Increase the amount." };
    if (router === "jupiterz" && code === 1) return { what: "Your wallet balance is too low for this swap.", safety: SAFE, next: "Lower the amount or add funds." };
    if (router === "jupiterz" && code === 2) return { what: "Your wallet has no token account for the token you are receiving yet.", safety: SAFE, next: "Try again, or pick a different amount. Another route may open the account for you." };
  }
  return { what: "Jupiter could not build a transaction for this swap.", safety: SAFE, next: "Try again in a moment, or change the amount." };
}

export function explorerUrl(base: string, signature: string): string {
  return `${base}${signature}`;
}

/** Transaksi base64 menjadi byte untuk wallet. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (alfabet Bitcoin/Solana). Ditulis lokal agar tidak memuat paket Solana untuk satu fungsi kecil; diuji terhadap @solana/kit. */
export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i] ?? 0;
    for (let j = 0; j < digits.length; j++) {
      carry += (digits[j] ?? 0) << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "1".repeat(zeros);
  for (let k = digits.length - 1; k >= 0; k--) out += B58[digits[k] ?? 0];
  return out;
}

/**
 * Tanda tangan pertama pada transaksi bertanda tangan (format wire: compact-u16 jumlah tanda tangan, lalu 64 byte per tanda tangan).
 * Valid sebagai ID transaksi hanya bila pemegang tanda tangan pertama adalah pembayar biaya (taker), yaitu bukan transaksi gasless.
 */
export function firstSignature(signedTx: Uint8Array): string | null {
  let offset = 0;
  let count = 0;
  let shift = 0;
  for (let i = 0; i < 3; i++) {
    const b = signedTx[offset++];
    if (b === undefined) return null;
    count |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  if (count < 1 || signedTx.length < offset + 64) return null;
  const sig = signedTx.slice(offset, offset + 64);
  if (sig.every((x) => x === 0)) return null;
  return base58Encode(sig);
}
