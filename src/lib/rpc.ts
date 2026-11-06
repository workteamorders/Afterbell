import { z } from "zod";
import { CONFIG } from "./config";

/**
 * Klien RPC. Semua panggilan lewat /api/rpc (allowlist metode di sisi function). Hanya metode baca dan simulasi.
 */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "blocked" | "rate-limited" | "rpc" | "bad-response",
  ) {
    super(message);
    this.name = "RpcError";
  }
}

const envelope = z.object({ result: z.unknown().optional(), error: z.object({ code: z.number().optional(), message: z.string() }).optional() }).loose();

export interface RpcOptions {
  path?: string;
  fetchImpl?: typeof fetch;
}

let nextId = 1;

export async function rpcCall<T>(method: string, params: unknown[], schema: z.ZodType<T>, opts: RpcOptions = {}): Promise<T> {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let res: Response;
  try {
    res = await doFetch(opts.path ?? CONFIG.rpcPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
  } catch {
    throw new RpcError("Could not reach the network service.", "network");
  }
  if (res.status === 403) throw new RpcError("This request is not allowed from your region or origin.", "blocked");
  if (res.status === 429) throw new RpcError("Too many requests. Wait a moment and try again.", "rate-limited");
  const json: unknown = await res.json().catch(() => null);
  const env = envelope.safeParse(json);
  if (!env.success) throw new RpcError("The network service returned an unexpected response.", "bad-response");
  if (env.data.error) throw new RpcError(env.data.error.message, "rpc");
  const out = schema.safeParse(env.data.result);
  if (!out.success) throw new RpcError("The network service returned data in an unexpected shape.", "bad-response");
  return out.data;
}

const ctx = z.object({ slot: z.number().optional() }).loose();

/* getMultipleAccounts */
const accountSchema = z
  .object({
    lamports: z.number().optional(),
    owner: z.string().optional(),
    data: z.unknown().optional(),
  })
  .loose();

export type RawAccount = z.infer<typeof accountSchema>;

const multipleSchema = z.object({ context: ctx.optional(), value: z.array(accountSchema.nullable()) });

export function getMultipleAccounts(addresses: readonly string[], config: Record<string, unknown>, opts?: RpcOptions): Promise<Array<RawAccount | null>> {
  if (addresses.length === 0) return Promise.resolve([]);
  return rpcCall("getMultipleAccounts", [addresses, { commitment: "confirmed", ...config }], multipleSchema, opts).then((r) => r.value);
}

const balanceSchema = z.object({ context: ctx.optional(), value: z.number() });
export function getBalance(owner: string, opts?: RpcOptions): Promise<number> {
  return rpcCall("getBalance", [owner, { commitment: "confirmed" }], balanceSchema, opts).then((r) => r.value);
}

/* simulateTransaction */
const simulationSchema = z.object({
  context: ctx.optional(),
  value: z
    .object({
      err: z.unknown().nullable(),
      logs: z.array(z.string()).nullable().optional(),
      unitsConsumed: z.number().nullish(),
    })
    .loose(),
});
export type Simulation = z.infer<typeof simulationSchema>["value"];

export function simulateTransaction(base64Tx: string, opts?: RpcOptions): Promise<Simulation> {
  return rpcCall(
    "simulateTransaction",
    [base64Tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" }],
    simulationSchema,
    opts,
  ).then((r) => r.value);
}

/* getSignatureStatuses */
const statusesSchema = z.object({
  context: ctx.optional(),
  value: z.array(z.object({ confirmationStatus: z.string().nullish(), err: z.unknown().nullable().optional() }).loose().nullable()),
});
export function getSignatureStatuses(signatures: readonly string[], opts?: RpcOptions) {
  return rpcCall("getSignatureStatuses", [signatures, { searchTransactionHistory: false }], statusesSchema, opts).then((r) => r.value);
}
