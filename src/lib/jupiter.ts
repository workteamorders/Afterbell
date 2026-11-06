import { z } from "zod";
import { CONFIG } from "./config";
import { CoalescingCache, SlidingWindowLimiter } from "./limiter";

/**
 * Klien Jupiter Swap v2. Hanya membaca field yang terdokumentasi di developers.jup.ag/docs/api-reference/swap/order
 * (diambil 2026-11-04). Field deprecated (priceImpactPct, swapType) tidak dipakai.
 */
const routeStep = z.object({
  swapInfo: z.object({ label: z.string().optional() }).loose(),
  percent: z.number().optional(),
  bps: z.number().optional(),
});

export const orderSchema = z
  .object({
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string().regex(/^\d+$/),
    outAmount: z.string().regex(/^\d+$/),
    otherAmountThreshold: z.string().optional(),
    priceImpact: z.number().optional(),
    slippageBps: z.number().optional(),
    router: z.string().optional(),
    routePlan: z.array(routeStep).optional(),
    inUsdValue: z.number().nullish(),
    outUsdValue: z.number().nullish(),
    referralAccount: z.string().nullish(),
    feeMint: z.string().nullish(),
    feeBps: z.number().nullish(),
    platformFee: z.object({ amount: z.string().optional(), feeBps: z.number().optional(), feeMint: z.string().optional() }).nullish(),
    signatureFeeLamports: z.number().nullish(),
    signatureFeePayer: z.string().nullish(),
    prioritizationFeeLamports: z.number().nullish(),
    rentFeeLamports: z.number().nullish(),
    gasless: z.boolean().optional(),
    transactionVersion: z.number().optional(),
    transaction: z.string().nullish(),
    lastValidBlockHeight: z.string().optional(),
    requestId: z.string().optional(),
    expireAt: z.string().optional(),
    taker: z.string().nullish(),
    errorCode: z.number().optional(),
    errorMessage: z.string().optional(),
  })
  .loose();

export type Order = z.infer<typeof orderSchema>;

export const executeSchema = z
  .object({
    status: z.enum(["Success", "Failed"]),
    signature: z.string().optional(),
    slot: z.string().optional(),
    error: z.string().optional(),
    code: z.number().optional(),
    totalInputAmount: z.string().optional(),
    totalOutputAmount: z.string().optional(),
  })
  .loose();

export type ExecuteResult = z.infer<typeof executeSchema>;

export interface OrderParams {
  inputMint: string;
  outputMint: string;
  /** Satuan terkecil. */
  amount: bigint;
  taker?: string;
  slippageBps?: number;
  referralAccount?: string;
  referralFee?: number;
}

export class JupiterError extends Error {
  constructor(
    message: string,
    readonly kind: "rate-limited" | "network" | "bad-response" | "rejected",
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "JupiterError";
  }
}

export function buildOrderQuery(p: OrderParams): string {
  const q = new URLSearchParams();
  q.set("inputMint", p.inputMint);
  q.set("outputMint", p.outputMint);
  q.set("amount", p.amount.toString());
  if (p.taker) q.set("taker", p.taker);
  if (p.slippageBps !== undefined) q.set("slippageBps", String(p.slippageBps));
  if (p.referralAccount && p.referralFee !== undefined) {
    q.set("referralAccount", p.referralAccount);
    q.set("referralFee", String(p.referralFee));
  }
  return q.toString();
}

export interface JupiterClientOptions {
  base?: string;
  fetchImpl?: typeof fetch;
  limiter?: SlidingWindowLimiter;
  cacheTtlMs?: number;
  now?: () => number;
}

export class JupiterClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  readonly limiter: SlidingWindowLimiter;
  private readonly quotes: CoalescingCache<Order>;
  private blockedUntil = 0;
  private readonly now: () => number;

  constructor(opts: JupiterClientOptions = {}) {
    this.base = (opts.base ?? CONFIG.jupiterBase).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.now = opts.now ?? Date.now;
    // 20 per 60 detik dari perilaku langsung; sisakan 4 untuk order bertaker dan execute.
    this.limiter = opts.limiter ?? new SlidingWindowLimiter(16, 60_000, this.now);
    this.quotes = new CoalescingCache<Order>(opts.cacheTtlMs ?? 10_000, this.now);
  }

  /** Kuotasi tanpa taker: di-cache sekitar 10 detik dan permintaan sama digabung. */
  quote(p: Omit<OrderParams, "taker">, signal?: AbortSignal): Promise<Order> {
    const key = buildOrderQuery(p);
    return this.quotes.get(key, () => this.order(key, signal));
  }

  peekQuote(p: Omit<OrderParams, "taker">): Order | undefined {
    return this.quotes.peek(buildOrderQuery(p));
  }

  staleQuote(p: Omit<OrderParams, "taker">): Order | undefined {
    return this.quotes.stale(buildOrderQuery(p));
  }

  /** Order bertaker (berisi transaksi). Tidak di-cache: setiap tanda tangan butuh order segar. */
  orderForTaker(p: OrderParams & { taker: string }, signal?: AbortSignal): Promise<Order> {
    return this.order(buildOrderQuery(p), signal);
  }

  private async order(query: string, signal?: AbortSignal): Promise<Order> {
    const wait = this.blockedUntil - this.now();
    if (wait > 0) throw new JupiterError("Jupiter asked us to slow down.", "rate-limited", wait);
    if (!this.limiter.tryAcquire()) {
      throw new JupiterError("Too many quote requests in the last minute.", "rate-limited", this.limiter.retryAfterMs());
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/order?${query}`, { signal, headers: { accept: "application/json" } });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new JupiterError("Could not reach Jupiter.", "network");
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const ms = Number.isFinite(reset) && reset > 0 ? Math.min(reset, 60) * 1000 : 10_000;
      this.blockedUntil = this.now() + ms;
      throw new JupiterError("Jupiter rate limit reached.", "rate-limited", ms);
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json && typeof json === "object" && "error" in json && typeof json.error === "string" ? json.error : `Jupiter answered HTTP ${res.status}.`;
      throw new JupiterError(msg, "rejected");
    }
    const parsed = orderSchema.safeParse(json);
    if (!parsed.success) throw new JupiterError("Jupiter returned a response in an unexpected shape.", "bad-response");
    return parsed.data;
  }

  /** Eksekusi wajib lewat /execute (rute RFQ menambah tanda tangan market maker di sana). */
  async execute(signedTransactionBase64: string, requestId: string, lastValidBlockHeight?: string): Promise<ExecuteResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ signedTransaction: signedTransactionBase64, requestId, ...(lastValidBlockHeight ? { lastValidBlockHeight } : {}) }),
      });
    } catch {
      throw new JupiterError("Could not reach Jupiter to send the swap. Check your wallet history before trying again.", "network");
    }
    const json: unknown = await res.json().catch(() => null);
    const parsed = executeSchema.safeParse(json);
    if (!parsed.success) throw new JupiterError(`Jupiter answered HTTP ${res.status} in an unexpected shape.`, "bad-response");
    return parsed.data;
  }
}

let shared: JupiterClient | undefined;
export function jupiter(): JupiterClient {
  shared ??= new JupiterClient();
  return shared;
}
