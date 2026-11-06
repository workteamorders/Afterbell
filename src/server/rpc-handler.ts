import { z } from "zod";
import { getEvmChain, tradeTargets } from "../lib/evm/chains";

/**
 * Relay RPC (satu-satunya kode server). Hanya metode BACA dan simulasi dalam allowlist.
 * Menolak getProgramAccounts, getTokenAccountsByOwner, dan metode lain di luar daftar.
 * Membatasi asal (CORS) dan laju per IP. Kunci penyedia RPC hanya ada di env `RPC_UPSTREAM_URL`.
 * Tidak ada state yang disimpan.
 */
export const ALLOWED_METHODS = [
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getLatestBlockhash",
  "simulateTransaction",
  "getSignatureStatuses",
  "sendTransaction",
] as const;
export type AllowedMethod = (typeof ALLOWED_METHODS)[number];

/** Metode EVM (dipakai bila permintaan membawa ?chain=). Hanya baca dan persiapan transaksi; pengiriman dilakukan wallet pengguna sendiri. */
export const EVM_ALLOWED_METHODS = ["eth_call", "eth_getBalance", "eth_blockNumber", "eth_chainId", "eth_estimateGas", "eth_gasPrice", "eth_getTransactionReceipt"] as const;

/** Metode yang memicu transaksi atau pra-periksa transaksi: ditolak untuk negara yang diblokir. */
const TRADE_METHODS: ReadonlySet<string> = new Set(["simulateTransaction", "sendTransaction"]);

const MAX_BODY_BYTES = 16 * 1024;
const MAX_ADDRESSES = 100;
const ALLOWED_CONFIG_KEYS = new Set([
  "commitment",
  "encoding",
  "dataSlice",
  "minContextSlot",
  "sigVerify",
  "replaceRecentBlockhash",
  "searchTransactionHistory",
  "skipPreflight",
  "preflightCommitment",
  "maxRetries",
]);

export interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface RpcEnv {
  RPC_UPSTREAM_URL?: string;
  /** Upstream per chain EVM, mis. EVM_RPC_UPSTREAM_URL_ETHEREUM. */
  EVM_RPC_UPSTREAM_URL_ETHEREUM?: string;
  /** "1" mengizinkan upstream publik bawaan untuk pengembangan lokal. Jangan dipakai di produksi. */
  ALLOW_DEFAULT_UPSTREAM?: string;
  ALLOWED_ORIGINS?: string;
  BLOCKED_COUNTRIES?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  RATE_LIMITER?: RateLimitBinding;
}

export const DEFAULT_DEV_UPSTREAM = "https://solana-rpc.publicnode.com";
/** Ethereum publicnode: "Mainnet endpoint link" pada publicnode.com (diambil 2026-11-04). Hanya untuk pengembangan lokal. */
export const DEFAULT_DEV_EVM_UPSTREAM: Record<string, string> = { ethereum: "https://ethereum.publicnode.com" };

const requestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string().max(64), z.number(), z.null()]),
    method: z.string().max(64),
    params: z.array(z.unknown()).max(3).optional(),
  })
  .strict();

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra },
  });
}

function rpcError(id: unknown, code: number, message: string, status: number, extra: Record<string, string> = {}): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status, extra);
}

export function parseList(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function countryOf(request: Request): string | null {
  const raw = request.headers.get("cf-ipcountry");
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export function isBlockedCountry(country: string | null, env: RpcEnv): boolean {
  if (!country) return false;
  return parseList(env.BLOCKED_COUNTRIES)
    .map((c) => c.toUpperCase())
    .includes(country);
}

/** Asal diizinkan bila sama dengan host permintaan atau ada di ALLOWED_ORIGINS. */
export function originAllowed(request: Request, env: RpcEnv): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === new URL(request.url).host) return true;
  return parseList(env.ALLOWED_ORIGINS).includes(origin);
}

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin ? { "access-control-allow-origin": origin, vary: "origin" } : {};
}

/* Penjaga laju per IP: token bucket per isolate (upaya terbaik). Binding Rate Limiting dipakai bila ada. */
const buckets = new Map<string, { tokens: number; at: number }>();
export function resetBuckets(): void {
  buckets.clear();
}

async function rateLimited(request: Request, env: RpcEnv, now: number): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.RATE_LIMITER) {
    try {
      return !(await env.RATE_LIMITER.limit({ key: ip })).success;
    } catch {
      /* jatuh ke token bucket */
    }
  }
  const perMinute = Math.max(1, Number(env.RATE_LIMIT_PER_MINUTE) || 120);
  const b = buckets.get(ip) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return true;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 5000) for (const k of buckets.keys()) if ((buckets.get(k)?.at ?? 0) < now - 120_000) buckets.delete(k);
  return false;
}

/** Memeriksa bentuk params: alamat/transaksi sebagai string, config hanya kunci yang diizinkan. */
export function validateParams(method: string, params: unknown[] | undefined): string | null {
  const p = params ?? [];
  const first = p[0];
  const config = p[1];
  if (config !== undefined) {
    if (typeof config !== "object" || config === null || Array.isArray(config)) return "Config must be an object.";
    for (const k of Object.keys(config)) if (!ALLOWED_CONFIG_KEYS.has(k)) return `Config key "${k}" is not allowed.`;
  }
  switch (method) {
    case "getMultipleAccounts":
    case "getSignatureStatuses":
      if (!Array.isArray(first) || first.some((x) => typeof x !== "string")) return "First parameter must be a list of strings.";
      if (first.length > MAX_ADDRESSES) return `At most ${MAX_ADDRESSES} items per call.`;
      return null;
    case "getLatestBlockhash":
      return null;
    case "simulateTransaction":
    case "sendTransaction":
      if (typeof first !== "string" || first.length > 4096) return "First parameter must be a base64 transaction.";
      return null;
    default:
      if (typeof first !== "string" || first.length > 100) return "First parameter must be a string.";
      return null;
  }
}

function resolveUpstream(env: RpcEnv, chain?: string): string | null {
  if (chain) {
    const key = `EVM_RPC_UPSTREAM_URL_${chain.toUpperCase()}` as keyof RpcEnv;
    const configured = env[key];
    if (typeof configured === "string" && configured) return configured;
    return env.ALLOW_DEFAULT_UPSTREAM === "1" ? (DEFAULT_DEV_EVM_UPSTREAM[chain] ?? null) : null;
  }
  if (env.RPC_UPSTREAM_URL) return env.RPC_UPSTREAM_URL;
  return env.ALLOW_DEFAULT_UPSTREAM === "1" ? DEFAULT_DEV_UPSTREAM : null;
}

const HEX = /^0x[0-9a-fA-F]*$/;
const MAX_EVM_DATA_CHARS = 8192;

/** Memeriksa params metode EVM: objek panggilan dengan field heks, tag blok "latest" atau heks. */
export function validateEvmParams(method: string, params: unknown[] | undefined): string | null {
  const p = params ?? [];
  const tag = (v: unknown) => v === undefined || v === "latest" || (typeof v === "string" && HEX.test(v));
  switch (method) {
    case "eth_blockNumber":
    case "eth_chainId":
    case "eth_gasPrice":
      return p.length === 0 ? null : "This method takes no parameters.";
    case "eth_getBalance":
      if (typeof p[0] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p[0])) return "First parameter must be an address.";
      return tag(p[1]) ? null : "Block tag must be latest or a hex number.";
    case "eth_getTransactionReceipt":
      return typeof p[0] === "string" && /^0x[0-9a-fA-F]{64}$/.test(p[0]) ? null : "First parameter must be a transaction hash.";
    case "eth_call":
    case "eth_estimateGas": {
      const call = p[0];
      if (typeof call !== "object" || call === null || Array.isArray(call)) return "First parameter must be a call object.";
      const allowed = new Set(["from", "to", "data", "value", "gas"]);
      for (const [k, v] of Object.entries(call)) {
        if (!allowed.has(k)) return `Call field "${k}" is not allowed.`;
        if (typeof v !== "string" || !HEX.test(v)) return `Call field "${k}" must be a hex string.`;
        if (k === "data" && v.length > MAX_EVM_DATA_CHARS) return "Call data is too large.";
        if ((k === "to" || k === "from") && v.length !== 42) return `Call field "${k}" must be an address.`;
      }
      if (typeof (call as { to?: unknown }).to !== "string") return "Call needs a to address.";
      if (method === "eth_call" && !tag(p[1])) return "Block tag must be latest or a hex number.";
      if (method === "eth_estimateGas" && p.length > 1) return "eth_estimateGas takes one parameter.";
      return null;
    }
    default:
      return "Unsupported method.";
  }
}

/** Persiapan transaksi di EVM: eth_estimateGas, atau eth_call ke kontrak router. Diblokir untuk negara yang diblokir. */
export function isEvmTradeCall(method: string, params: unknown[] | undefined): boolean {
  if (method === "eth_estimateGas") return true;
  if (method !== "eth_call") return false;
  const to = (params?.[0] as { to?: string } | undefined)?.to;
  return typeof to === "string" && tradeTargets().includes(to.toLowerCase());
}

export interface HandleDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function handleRpc(request: Request, env: RpcEnv, deps: HandleDeps = {}): Promise<Response> {
  const now = deps.now?.() ?? Date.now();
  const doFetch = deps.fetchImpl ?? fetch;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    if (!originAllowed(request, env)) return json({ error: "Origin not allowed." }, 403);
    return new Response(null, {
      status: 204,
      headers: { ...cors(request), "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600" },
    });
  }

  /* GET: status wilayah. Tidak membutuhkan Origin (dibaca halaman sendiri) dan tidak menyentuh upstream. */
  if (method === "GET") {
    const country = countryOf(request);
    return json({ country, blocked: isBlockedCountry(country, env) }, 200);
  }

  if (method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "GET, POST, OPTIONS" });

  if (!originAllowed(request, env)) return json({ error: "Origin not allowed." }, 403);
  const corsHeaders = cors(request);

  if (await rateLimited(request, env, now)) return rpcError(null, -32005, "Rate limit exceeded. Try again shortly.", 429, { ...corsHeaders, "retry-after": "10" });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return rpcError(null, -32600, "Request too large.", 413, corsHeaders);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return rpcError(null, -32600, "Request too large.", 413, corsHeaders);

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    return rpcError(null, -32700, "Parse error.", 400, corsHeaders);
  }
  const parsed = requestSchema.safeParse(parsedBody);
  if (!parsed.success) return rpcError(null, -32600, "Invalid request. Batches are not supported.", 400, corsHeaders);
  const req = parsed.data;

  const chainParam = new URL(request.url).searchParams.get("chain");
  if (chainParam !== null && !getEvmChain(chainParam)) return rpcError(req.id, -32602, "Unknown chain.", 400, corsHeaders);
  const chain = chainParam ?? undefined;

  const allowedList: readonly string[] = chain ? EVM_ALLOWED_METHODS : ALLOWED_METHODS;
  if (!allowedList.includes(req.method)) {
    return rpcError(req.id, -32601, `Method "${req.method}" is not allowed on this relay.`, 403, corsHeaders);
  }
  const bad = chain ? validateEvmParams(req.method, req.params) : validateParams(req.method, req.params);
  if (bad) return rpcError(req.id, -32602, bad, 400, corsHeaders);

  const isTrade = chain ? isEvmTradeCall(req.method, req.params) : TRADE_METHODS.has(req.method);
  if (isTrade && isBlockedCountry(countryOf(request), env)) {
    return rpcError(req.id, -32003, "Trading is not available in your region.", 403, corsHeaders);
  }

  const upstream = resolveUpstream(env, chain);
  if (!upstream) return rpcError(req.id, -32002, "The RPC upstream is not configured.", 503, corsHeaders);

  let res: Response;
  try {
    res = await doFetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: req.id, method: req.method, params: req.params ?? [] }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return rpcError(req.id, -32004, "The RPC upstream did not answer.", 504, corsHeaders);
  }
  if (res.status === 429) return rpcError(req.id, -32005, "The RPC upstream is rate limiting. Try again shortly.", 429, { ...corsHeaders, "retry-after": "10" });
  if (!res.ok) return rpcError(req.id, -32004, "The RPC upstream returned an error.", 502, corsHeaders);

  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...corsHeaders },
  });
}
