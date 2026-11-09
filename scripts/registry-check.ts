/**
 * pnpm registry:check            validasi skema + periksa on-chain (butuh jaringan ke RPC)
 * pnpm registry:check --offline  hanya validasi skema
 * pnpm registry:check --pools    juga memindai peristiwa Initialize PoolManager di Robinhood Chain
 * pnpm registry:check --pools-only         hanya laporan kolam Robinhood Chain (tanpa pemeriksaan lain)
 * pnpm registry:check --pools-from <file>  baca likuiditas kolam USDG tanpa hook non-standar dari keluaran --pools-only
 *
 * Pemeriksaan on-chain: setiap mint ada, dimiliki program token yang tercatat, decimals cocok.
 * Fakta kendali penerbit (freeze authority, ekstensi) dicetak apa adanya; ini fakta, bukan penilaian.
 * EVM (Ethereum dan Robinhood Chain): untuk setiap token di registry/evm-tokens.json, kontrak punya kode, decimals() terbaca, dan
 * chain ID sesuai konfigurasi. Alamat Uniswap dan aset dolar (USDC, USDG) juga diperiksa punya kode dan decimals yang cocok.
 * Robinhood Chain: nama dan simbol token dicetak untuk dibandingkan dengan daftar Robinhood, dan kolam Uniswap v4 yang dipakai
 * Afterbell dilaporkan. EVM_RPC_URL mengganti RPC Ethereum, EVM_RPC_URL_ROBINHOOD mengganti RPC publik Robinhood Chain.
 * Skrip ini hanya MEMBACA. Tidak ada transaksi yang dikirim.
 */
import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData, getAddress, parseAbi, toEventSelector, type Abi } from "viem";
import { erc20Abi, stateViewAbi } from "../src/lib/evm/abi";
import { EVM_CHAINS, type EvmChainV4 } from "../src/lib/evm/chains";
import { candidatePools, NO_HOOKS, poolId, type PoolKey } from "../src/lib/evm/v4";
import { evmTokensSchema } from "../src/lib/registry/evm-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRegistry } from "../src/lib/registry/schema";
import { tokenProgramAddress } from "../src/lib/solana/token-programs";

const root = join(import.meta.dirname, "..");
const read = (f: string): unknown => JSON.parse(readFileSync(join(root, "registry", f), "utf8"));

const offline = process.argv.includes("--offline");
const RPC_URL = process.env.RPC_URL ?? "https://solana-rpc.publicnode.com";

interface ParsedMint {
  data?: { program?: string; parsed?: { type?: string; info?: { decimals?: number; freezeAuthority?: string | null; mintAuthority?: string | null; extensions?: Array<{ extension: string }> } } };
  owner?: string;
}

/** RPC per chain EVM. EVM_RPC_URL mengganti RPC Ethereum; EVM_RPC_URL_ROBINHOOD mengganti RPC publik Robinhood Chain (dibatasi lajunya). */
const EVM_RPC_URLS: Record<string, string> = {
  ethereum: process.env.EVM_RPC_URL ?? "https://ethereum.publicnode.com",
  robinhood: process.env.EVM_RPC_URL_ROBINHOOD ?? "https://rpc.mainnet.chain.robinhood.com",
};

/** Jeda minimum antar permintaan (ms) dan jumlah percobaan ulang saat RPC menjawab 429 atau 5xx. RPC publik membatasi laju. */
const RPC_DELAY_MS = Number(process.env.EVM_RPC_DELAY_MS ?? 120);
const RPC_RETRIES = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRpcAt = 0;

async function evmRpc(chainId: string, method: string, params: unknown[]): Promise<string> {
  const url = EVM_RPC_URLS[chainId];
  if (!url) throw new Error(`No RPC configured for ${chainId}`);
  let res: Response | undefined;
  for (let attempt = 0; attempt <= RPC_RETRIES; attempt++) {
    const wait = lastRpcAt + RPC_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRpcAt = Date.now();
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (res.status !== 429 && res.status < 500) break;
    if (attempt === RPC_RETRIES) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 1000 * 2 ** attempt));
  }
  if (!res || !res.ok) throw new Error(`${chainId} RPC ${url} answered HTTP ${res?.status}. On-chain check not done.`);
  const body = (await res.json()) as { result?: string; error?: { message: string } };
  if (body.result === undefined) throw new Error(`${chainId} RPC error: ${body.error?.message ?? "no result"}`);
  return body.result;
}

const metaAbi = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]);
const call = async (chainId: string, to: string, abi: Abi, functionName: string, args: unknown[] = []) =>
  decodeFunctionResult({ abi, functionName, data: (await evmRpc(chainId, "eth_call", [{ to, data: encodeFunctionData({ abi, functionName, args }) }, "latest"])) as `0x${string}` });

/** Pemeriksaan umum untuk satu chain EVM: chain ID, kode kontrak di alamat konfigurasi, decimals aset dolar, dan tiap token registry. */
async function checkEvm(chainKey: "ethereum" | "robinhood", tokens: ReturnType<typeof evmTokensSchema.parse>, findPools: boolean): Promise<number> {
  const chain = EVM_CHAINS[chainKey];
  const mine = tokens.filter((t) => t.chain === chainKey);
  let failures = 0;
  const id = Number(BigInt(await evmRpc(chainKey, "eth_chainId", [])));
  if (id !== chain.chainId) {
    console.error(`FAIL ${chain.name} RPC reports chain ID ${id}, config says ${chain.chainId}`);
    return 1;
  }
  console.log(`OK   ${chain.name} chain ID ${id}`);
  const hasCode = async (address: string) => {
    const code = await evmRpc(chainKey, "eth_getCode", [address, "latest"]);
    return code !== "0x" && code.length > 2;
  };
  const infra: Array<readonly [string, string]> =
    chain.venue === "uniswap-v3"
      ? [
          [chain.usd.symbol, chain.usd.address],
          ["Uniswap v3 QuoterV2", chain.uniswapV3.quoterV2],
          ["Uniswap v3 SwapRouter02", chain.uniswapV3.swapRouter02],
          ["Uniswap v3 Factory", chain.uniswapV3.factory],
        ]
      : [
          [chain.usd.symbol, chain.usd.address],
          ["Uniswap v4 PoolManager", chain.uniswapV4.poolManager],
          ["Uniswap v4 Universal Router", chain.uniswapV4.universalRouter],
          ["Uniswap v4 Quoter", chain.uniswapV4.quoter],
          ["Uniswap v4 StateView", chain.uniswapV4.stateView],
          ["Permit2", chain.uniswapV4.permit2],
        ];
  for (const [label, address] of infra) {
    if (await hasCode(address)) console.log(`OK   ${label} (${address}) has contract code`);
    else {
      failures += 1;
      console.error(`FAIL ${label} (${address}) has no contract code`);
    }
  }
  const usdDecimals = Number(await call(chainKey, chain.usd.address, erc20Abi, "decimals"));
  if (usdDecimals !== chain.usd.decimals) {
    failures += 1;
    console.error(`FAIL ${chain.usd.symbol} decimals on-chain ${usdDecimals}, config ${chain.usd.decimals}`);
  } else console.log(`OK   ${chain.usd.symbol} decimals ${usdDecimals} match the config${chain.usd.decimalsVerified ? "" : " (not stated by the source, so this is the only confirmation)"}`);

  for (const t of mine) {
    try {
      if (!(await hasCode(t.address))) throw new Error("no contract code at this address");
      const d = Number(await call(chainKey, t.address, erc20Abi, "decimals"));
      // Robinhood dokumentasi menyatakan semua Stock Token memakai 18 desimal; selisih dianggap kegagalan.
      if (chainKey === "robinhood" && d !== 18) throw new Error(`decimals ${d}, Robinhood documents 18`);
      let meta = "";
      if (chainKey === "robinhood") {
        const [name, symbol] = await Promise.all([call(chainKey, t.address, metaAbi, "name"), call(chainKey, t.address, metaAbi, "symbol")]);
        meta = ` name="${String(name)}" symbol="${String(symbol)}"`;
      }
      console.log(`OK   ${t.symbol.padEnd(7)} ${t.address} decimals=${d}${meta}`);
    } catch (e) {
      failures += 1;
      console.error(`FAIL ${t.symbol} (${t.address}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (chain.venue === "uniswap-v4") failures += await reportV4Pools(chain, mine, findPools);
  return failures;
}

/** Hanya melaporkan: kolam standar tanpa hook yang punya likuiditas, dan (dengan --pools) semua kolam yang pernah diinisialisasi untuk token. */
async function reportV4Pools(chain: EvmChainV4, tokens: ReturnType<typeof evmTokensSchema.parse>, scan: boolean): Promise<number> {
  const key = "robinhood";
  console.log(`\nPools for ${tokens.length} tokens against ${chain.usd.symbol} (standard fee/tick pairs, no hook):`);
  let withPool = 0;
  let unreadable = 0;
  for (const t of tokens) {
    const live: string[] = [];
    try {
      for (const k of candidatePools(chain, t.address, chain.usd.address)) {
        const l = (await call(key, chain.uniswapV4.stateView, stateViewAbi, "getLiquidity", [poolId(k)])) as bigint;
        if (l > 0n) live.push(`${(k.fee / 10_000).toFixed(2)}% (liquidity ${l})`);
      }
    } catch (e) {
      unreadable += 1;
      console.log(`  ${t.symbol.padEnd(7)} POOL CHECK FAILED: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (live.length) withPool += 1;
    console.log(`  ${t.symbol.padEnd(7)} ${live.length ? live.join(", ") : "no standard pool with liquidity"}`);
  }
  console.log(`${withPool} of ${tokens.length} tokens have at least one standard pool Afterbell can use.${unreadable ? ` ${unreadable} could not be read (see POOL CHECK FAILED lines), so they are not counted either way.` : ""}`);
  if (unreadable) return unreadable;
  if (!scan) {
    console.log("Run with --pools to scan PoolManager Initialize events and list every pool (including hooked or ETH-paired ones).");
    return 0;
  }
  const topic = toEventSelector("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
  console.log("\nReading every Initialize event from the PoolManager once (progress below), then matching tokens in memory:");
  const logs = await getLogsChunked(key, chain.uniswapV4.poolManager, [topic]);
  const pools = logs.map((l) => {
    const [fee, tickSpacing, hooks] = decodeAbiParameters([{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }], l.data as `0x${string}`);
    return { id: l.topics[1] as string, currency0: getAddress(`0x${(l.topics[2] as string).slice(-40)}`), currency1: getAddress(`0x${(l.topics[3] as string).slice(-40)}`), fee, tickSpacing, hooks: getAddress(hooks) };
  });
  console.log(`${pools.length} pools were ever initialized on this PoolManager.`);
  console.log("Pool Initialize events per token. Paste a row into the token's `pools` in registry/evm-tokens.json only after checking it:");
  for (const t of tokens) {
    const mine = pools.filter((p) => p.currency0.toLowerCase() === t.address.toLowerCase() || p.currency1.toLowerCase() === t.address.toLowerCase());
    console.log(`  ${t.symbol.padEnd(7)} ${mine.length} pool(s)`);
    for (const p of mine) console.log(`    ${p.id} ${JSON.stringify({ currency0: p.currency0, currency1: p.currency1, fee: p.fee, tickSpacing: p.tickSpacing, hooks: p.hooks })}`);
  }
  return 0;
}

/**
 * Membaca file keluaran `--pools-only` (tanpa memindai ulang), menyaring kolam USDG tanpa hook dengan fee/tick di luar grid standar,
 * lalu membaca likuiditasnya dari StateView. Kolam dengan hook sengaja diabaikan: hook adalah kode pihak ketiga yang ikut berjalan saat swap.
 * Hanya MEMBACA; tidak mengubah registry. Baris JSON yang dicetak ditempel ke `pools` token hanya setelah ditinjau.
 */
async function reportScannedPools(chain: EvmChainV4, tokens: ReturnType<typeof evmTokensSchema.parse>, file: string): Promise<number> {
  const usd = chain.usd.address.toLowerCase();
  const standard = new Set(chain.poolGrid.map((g) => `${g.fee}:${g.tickSpacing}`));
  const bySymbol = new Map(tokens.map((t) => [t.symbol, t]));
  const stats = new Map<string, { total: number; usdNoHook: number; custom: PoolKey[] }>();
  let current: (typeof tokens)[number] | undefined;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const head = /^ {2}(\S+) +\d+ pool\(s\)$/.exec(line);
    if (head) {
      current = bySymbol.get(head[1] as string);
      if (current) stats.set(current.symbol, { total: 0, usdNoHook: 0, custom: [] });
      continue;
    }
    const row = /^ {4}(0x[0-9a-fA-F]{64}) (\{.*\})$/.exec(line);
    if (!row || !current) continue;
    const s = stats.get(current.symbol);
    if (!s) continue;
    s.total += 1;
    const p = JSON.parse(row[2] as string) as { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string };
    const sides = [p.currency0.toLowerCase(), p.currency1.toLowerCase()];
    if (!sides.includes(usd) || !sides.includes(current.address.toLowerCase())) continue;
    if (p.hooks.toLowerCase() !== NO_HOOKS) continue;
    s.usdNoHook += 1;
    if (standard.has(`${p.fee}:${p.tickSpacing}`)) continue;
    const key: PoolKey = { currency0: getAddress(p.currency0), currency1: getAddress(p.currency1), fee: p.fee, tickSpacing: p.tickSpacing, hooks: NO_HOOKS };
    if (poolId(key).toLowerCase() !== (row[1] as string).toLowerCase()) continue;
    s.custom.push(key);
  }
  console.log(`Read ${stats.size} tokens from ${file}. Looking only at ${chain.usd.symbol} pools without a hook whose fee/tick is outside the standard grid.`);
  let gained = 0;
  let unreadable = 0;
  for (const t of tokens) {
    const s = stats.get(t.symbol);
    if (!s) continue;
    const liquid: Array<{ key: PoolKey; liquidity: bigint }> = [];
    for (const key of s.custom) {
      try {
        const l = (await call("robinhood", chain.uniswapV4.stateView, stateViewAbi, "getLiquidity", [poolId(key)])) as bigint;
        if (l > 0n) liquid.push({ key, liquidity: l });
      } catch (e) {
        unreadable += 1;
        console.log(`  ${t.symbol.padEnd(7)} POOL CHECK FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (liquid.length) gained += 1;
    console.log(`  ${t.symbol.padEnd(7)} initialized=${s.total} usdg-no-hook=${s.usdNoHook} non-standard=${s.custom.length} with-liquidity=${liquid.length}`);
    for (const { key, liquidity } of liquid) console.log(`    ${JSON.stringify({ ...key, liquidity: liquidity.toString() })}`);
  }
  console.log(`${gained} tokens have at least one extra no-hook ${chain.usd.symbol} pool with liquidity outside the standard grid.${unreadable ? ` ${unreadable} reads failed.` : ""}`);
  return unreadable;
}

/** eth_getLogs dengan rentang yang mengecil bila RPC menolak rentang besar. */
async function getLogsChunked(chainKey: string, address: string, topics: Array<string | null>): Promise<Array<{ topics: string[]; data: string }>> {
  const latest = Number(BigInt(await evmRpc(chainKey, "eth_blockNumber", [])));
  const out: Array<{ topics: string[]; data: string }> = [];
  let from = 0;
  let step = 5_000_000;
  while (from <= latest) {
    const to = Math.min(latest, from + step - 1);
    try {
      const logs = (await evmRpc(chainKey, "eth_getLogs", [{ address, topics, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }])) as unknown as Array<{ topics: string[]; data: string }>;
      out.push(...logs);
      from = to + 1;
      console.log(`  scanned blocks up to ${to} of ${latest} (${out.length} events so far)`);
      step = Math.min(5_000_000, step * 2);
    } catch (e) {
      if (step <= 1_000) throw e;
      step = Math.floor(step / 4);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { issuers, tokens } = validateRegistry(read("issuers.json"), read("tokens.json"));
  console.log(`Schema OK: ${issuers.length} issuers, ${tokens.length} tokens. Every entry has a source URL and a last-checked date.`);
  const evmTokens = evmTokensSchema.parse(read("evm-tokens.json"));
  const unknownIssuer = evmTokens.filter((t) => !issuers.some((i) => i.id === t.issuer));
  if (unknownIssuer.length) throw new Error(`EVM tokens with unknown issuer: ${unknownIssuer.map((t) => t.symbol).join(", ")}`);
  console.log(`Schema OK: ${evmTokens.length} EVM tokens (${evmTokens.filter((t) => t.chain === "ethereum").length} on Ethereum, ${evmTokens.filter((t) => t.chain === "robinhood").length} on Robinhood Chain).`);
  if (offline) return;

  const fromAt = process.argv.indexOf("--pools-from");
  if (fromAt >= 0) {
    const file = process.argv[fromAt + 1];
    if (!file) throw new Error("--pools-from needs the path of a --pools-only output file");
    const failed = await reportScannedPools(EVM_CHAINS.robinhood, evmTokens.filter((t) => t.chain === "robinhood"), file);
    if (failed) process.exit(1);
    return;
  }

  if (process.argv.includes("--pools-only")) {
    // Hanya laporan kolam Robinhood Chain: tanpa pemeriksaan Solana, Ethereum, atau tiap kontrak token (sudah diperiksa di run penuh).
    const failed = await reportV4Pools(EVM_CHAINS.robinhood, evmTokens.filter((t) => t.chain === "robinhood"), true);
    if (failed) process.exit(1);
    return;
  }

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [tokens.map((t) => t.mint), { encoding: "jsonParsed", commitment: "confirmed" }],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${RPC_URL} answered HTTP ${res.status}. On-chain check not done.`);
  const body = (await res.json()) as { result?: { value: Array<ParsedMint | null> }; error?: { message: string } };
  if (!body.result) throw new Error(`RPC error: ${body.error?.message ?? "no result"}`);

  let failures = 0;
  tokens.forEach((t, i) => {
    const acct = body.result?.value[i] ?? null;
    const problems: string[] = [];
    if (!acct) problems.push("account does not exist");
    else {
      const expectedProgram = tokenProgramAddress(t.tokenProgram);
      if (acct.owner !== expectedProgram) problems.push(`owner is ${acct.owner}, registry says ${expectedProgram}`);
      const info = acct.data?.parsed?.info;
      if (acct.data?.parsed?.type !== "mint") problems.push("account is not a mint");
      if (info?.decimals !== t.decimals) problems.push(`decimals on-chain ${info?.decimals}, registry ${t.decimals}`);
      const ext = (info?.extensions ?? []).map((e) => e.extension).join(", ") || "none";
      console.log(`  ${t.symbol.padEnd(7)} freezeAuthority=${info?.freezeAuthority ?? "none"} mintAuthority=${info?.mintAuthority ?? "none"} extensions=${ext}`);
    }
    if (problems.length) {
      failures += 1;
      console.error(`FAIL ${t.symbol} (${t.mint}): ${problems.join("; ")}`);
    } else console.log(`OK   ${t.symbol} (${t.mint})`);
  });
  failures += await checkEvm("ethereum", evmTokens, false);
  failures += await checkEvm("robinhood", evmTokens, process.argv.includes("--pools"));
  if (failures) process.exit(1);
  console.log("On-chain check OK.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
