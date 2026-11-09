/**
 * Robinhood Chain (4663) lokal dengan kontrak Uniswap v4 dan Stock Token asli, untuk menguji Afterbell tanpa uang sungguhan.
 *
 *   pnpm fork              layani snapshot tersimpan di http://127.0.0.1:8545
 *   pnpm fork --refresh    fork ulang mainnet dulu (kolam dan likuiditas terbaru)
 *   FORK_TOKENS=SPY,QQQ pnpm fork --refresh    hanya hangatkan token itu (lebih cepat)
 *
 * RPC publik hanya menyimpan state sekitar 10 menit terakhir, jadi `anvil --fork-url` yang dibiarkan hidup rusak begitu blok
 * fork-nya kedaluwarsa. Karena itu skrip ini fork sekali, menjalankan jalur yang dipakai Afterbell (kuotasi, persetujuan Permit2, swap
 * beli dan jual) sebagai transaksi sungguhan untuk setiap token yang punya kolam berlikuiditas, menyimpan state ke berkas, lalu
 * melayani berkas itu TANPA upstream. Akun yang tak pernah tersentuh terbaca kosong. Tanpa kunci API, tanpa memburu pemegang USDG
 * (saldo diisi lewat anvil_dealERC20).
 *
 * Hanya MEMBACA mainnet (lewat fork). Tidak ada transaksi ke chain sungguhan. Perlu Foundry (anvil): ANVIL=…, ~/.foundry/bin, atau PATH.
 * Batasan: swap yang melewati rentang harga yang tidak ikut dipanaskan membaca likuiditas kosong, jadi jumlah sangat besar bisa
 * menampilkan harga lebih buruk daripada pasar sungguhan.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createPublicClient, decodeFunctionResult, defineChain, encodeFunctionData, erc20Abi, http, parseEther, toHex, type Address, type Hex } from "viem";
import { permit2Abi, stateViewAbi, v4QuoterAbi } from "../src/lib/evm/abi";
import { EVM_CHAINS } from "../src/lib/evm/chains";
import { buildApprove, buildPermit2Approve, buildSwap, type Call } from "../src/lib/evm/swap";
import { candidatePools, isZeroForOne, poolId, type PoolKey } from "../src/lib/evm/v4";
import { evmTokensSchema } from "../src/lib/registry/evm-schema";

const chain = EVM_CHAINS.robinhood;
const usd = chain.usd;
const ROOT = join(import.meta.dirname, "..");
const SNAPSHOT = join(ROOT, ".fork", "robinhood-4663.json");
const PORT = Number(process.env.FORK_PORT ?? 8545);
const WARM_PORT = PORT + 1;
const UPSTREAM = process.env.RPC_URL_ROBINHOOD || chain.walletAdd?.rpcUrls[0] || "https://rpc.mainnet.chain.robinhood.com";

/** Akun uji bawaan Anvil (mnemonic "test test … junk"), terbuka di node lokal. Kuncinya publik: jangan dipakai di jaringan sungguhan. */
const DEV_ACCOUNTS: Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
];
const DEV = DEV_ACCOUNTS[0] as Address;
const UNIT = 10n ** BigInt(usd.decimals);
/** Jumlah USDG yang dipanaskan di tiap kolam: kecil, sedang, besar. */
const WARM_USD = [10n * UNIT, 250n * UNIT, 5_000n * UNIT];
const BIG = 2n ** 128n - 1n;
/**
 * RPC publik membuang state setelah sekitar 10 menit, jadi pemanasan dibatasi waktu: token baru tidak dimulai setelah anggaran habis
 * (detik sejak fork, FORK_WARM_BUDGET_S), supaya pin dan dump masih sempat. Token utama dihangatkan lebih dulu.
 * FORK_TOKENS=SPY,QQQ membatasi pemanasan ke token itu saja.
 */
const WARM_BUDGET_S = Number(process.env.FORK_WARM_BUDGET_S ?? 330);
const PRIORITY = ["SPY", "QQQ", "MSFT"];
const ONLY = (process.env.FORK_TOKENS ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);

function anvilPath(): string {
  if (process.env.ANVIL) return process.env.ANVIL;
  const local = join(homedir(), ".foundry", "bin", "anvil");
  return existsSync(local) ? local : "anvil";
}

function startAnvil(args: string[], quiet: boolean): ChildProcess {
  const child = spawn(anvilPath(), [...args, "--chain-id", String(chain.chainId)], { stdio: quiet ? "ignore" : "inherit" });
  child.on("error", (e) => {
    console.error(`Could not start anvil (${e.message}). Install Foundry (brew install foundry) or set ANVIL=/path/to/anvil.`);
    process.exit(1);
  });
  return child;
}

function client(port: number) {
  const url = `http://127.0.0.1:${port}`;
  const def = defineChain({ id: chain.chainId, name: chain.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [url] } } });
  return createPublicClient({ chain: def, transport: http(url, { retryCount: 0 }) });
}
type Client = ReturnType<typeof client>;
const anvil = (c: Client, method: string, params: unknown[]) => c.request({ method, params } as never);

async function waitFor(port: number): Promise<Client> {
  const c = client(port);
  for (let i = 0; i < 120; i++) {
    try {
      await c.getChainId();
      return c;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`anvil did not come up on port ${port}`);
}

async function dealErc20(c: Client, to: Address, token: Address, amount: bigint): Promise<boolean> {
  try {
    await anvil(c, "anvil_dealERC20", [to, token, toHex(amount)]);
    return (await c.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [to] })) === amount;
  } catch {
    return false;
  }
}

/** Mengosongkan kode yang mungkin terpasang di kunci uji publik (sweeper EIP-7702 di mainnet), lalu mengisi ETH dan USDG. */
async function prepareDevAccounts(c: Client, withUsd: boolean): Promise<void> {
  for (const a of DEV_ACCOUNTS) {
    await anvil(c, "anvil_setCode", [a, "0x"]);
    await anvil(c, "anvil_setBalance", [a, toHex(parseEther("10000"))]);
    if (withUsd && !(await dealErc20(c, a, usd.address, 10_000n * UNIT))) console.log(`  could not fund ${usd.symbol} for ${a}`);
  }
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

type Token = ReturnType<typeof evmTokensSchema.parse>[number];
interface Live {
  token: Token;
  pools: Array<{ key: PoolKey; liquidity: bigint }>;
}

/** Token Robinhood yang punya kolam USDG tanpa hook (grid standar atau `pools` registry) dengan likuiditas > 0. */
async function discover(c: Client): Promise<Live[]> {
  const tokens = evmTokensSchema.parse(JSON.parse(readFileSync(join(ROOT, "registry", "evm-tokens.json"), "utf8"))).filter((t) => t.chain === "robinhood");
  const rows = await mapLimited(tokens, 6, async (token): Promise<Live> => {
    const pools: Live["pools"] = [];
    for (const key of candidatePools(chain, token.address, usd.address, token.pools ?? [])) {
      const liquidity = await c.readContract({ address: chain.uniswapV4.stateView, abi: stateViewAbi, functionName: "getLiquidity", args: [poolId(key)] }).catch(() => 0n);
      if (liquidity > 0n) pools.push({ key, liquidity });
    }
    return { token, pools };
  });
  return rows.filter((r) => r.pools.length > 0);
}

const quoteData = (key: PoolKey, tokenIn: string, amount: bigint): Hex =>
  encodeFunctionData({ abi: v4QuoterAbi, functionName: "quoteExactInputSingle", args: [{ poolKey: key, zeroForOne: isZeroForOne(key, tokenIn), exactAmount: amount, hookData: "0x" }] });

async function warm(c: Client, live: Live[], started: number): Promise<Live[]> {
  const hashes: Hex[] = [];
  const done: Live[] = [];
  const failed: string[] = [];
  const now = (await c.getBlock()).timestamp;
  const send = async (call: Call, label: string): Promise<boolean> => {
    try {
      const hash = (await anvil(c, "eth_sendTransaction", [{ from: DEV, to: call.to, data: call.data, gas: toHex(30_000_000n) }])) as Hex;
      const receipt = await c.waitForTransactionReceipt({ hash, timeout: 300_000 });
      hashes.push(hash);
      if (receipt.status !== "success") throw new Error("reverted");
      return true;
    } catch (e) {
      failed.push(`${label}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      return false;
    }
  };
  const views = (token: Address): Call[] => [
    { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }) },
    { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [DEV] }) },
    { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [DEV, chain.uniswapV4.permit2] }) },
    { to: chain.uniswapV4.permit2, data: encodeFunctionData({ abi: permit2Abi, functionName: "allowance", args: [DEV, token, chain.uniswapV4.universalRouter] }) },
  ];

  // USDG: persetujuan sekali untuk semua token (akun uji saja).
  const expiry = Number(now) + 30 * 24 * 3600;
  await send(buildApprove(chain, usd.address, BIG), `${usd.symbol} approve`);
  await send(buildPermit2Approve(chain, usd.address, BIG, expiry), `${usd.symbol} Permit2 approve`);
  for (const v of views(usd.address)) await send(v, `${usd.symbol} view`);

  let n = 0;
  for (const entry of live) {
    const { token, pools } = entry;
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed > WARM_BUDGET_S) {
      const left = live.slice(done.length).map((l) => l.token.symbol);
      console.log(`  warm: time budget (${WARM_BUDGET_S} s) reached, not warming: ${left.join(", ")} (FORK_TOKENS=… or FORK_WARM_BUDGET_S=… changes this)`);
      break;
    }
    n += 1;
    // Isi cache upstream secara paralel dulu (eth_call), supaya transaksi di bawah berjalan dari memori.
    const quotes = await mapLimited(
      pools.flatMap((p) => WARM_USD.map((amount) => ({ p, amount }))),
      6,
      async ({ p, amount }) => {
        const out = await c.call({ to: chain.uniswapV4.quoter, data: quoteData(p.key, usd.address, amount) }).catch(() => null);
        if (!out?.data) return { p, amount, out: 0n };
        const [amountOut] = decodeFunctionResult({ abi: v4QuoterAbi, functionName: "quoteExactInputSingle", data: out.data });
        return { p, amount, out: amountOut };
      },
    );
    // Kuotasi sebagai transaksi: beli (USDG -> token) dan jual (token -> USDG) di tiap kolam dan jumlah.
    for (const q of quotes) {
      await send({ to: chain.uniswapV4.quoter, data: quoteData(q.p.key, usd.address, q.amount) }, `${token.symbol} quote buy`);
      if (q.out > 0n) await send({ to: chain.uniswapV4.quoter, data: quoteData(q.p.key, token.address, q.out) }, `${token.symbol} quote sell`);
    }
    // Swap sungguhan di kolam terbaik pada jumlah menengah: beli, lalu setujui token dan jual separuh.
    const mid = quotes.filter((q) => q.amount === WARM_USD[1]).sort((a, b) => (b.out > a.out ? 1 : -1))[0];
    if (mid && mid.out > 0n) {
      const deadline = now + 3600n;
      const bought = await send(buildSwap(chain, { tokenIn: usd.address, tokenOut: token.address, fee: mid.p.key.fee, pool: mid.p.key, recipient: DEV, amountIn: mid.amount, amountOutMinimum: 0n, deadline }), `${token.symbol} buy`);
      const balance = bought ? await c.readContract({ address: token.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [DEV] }) : 0n;
      if (balance > 0n) {
        await send(buildApprove(chain, token.address, balance), `${token.symbol} approve`);
        await send(buildPermit2Approve(chain, token.address, balance, expiry), `${token.symbol} Permit2 approve`);
        await send(buildSwap(chain, { tokenIn: token.address, tokenOut: usd.address, fee: mid.p.key.fee, pool: mid.p.key, recipient: DEV, amountIn: balance / 2n, amountOutMinimum: 0n, deadline }), `${token.symbol} sell`);
      }
    }
    for (const v of views(token.address as Address)) await send(v, `${token.symbol} view`);
    done.push(entry);
    console.log(`  warm ${n}/${live.length}: ${token.symbol.padEnd(6)} ${pools.length} pool(s)  [${Math.round((Date.now() - started) / 1000)} s]`);
  }
  console.log(`  warm: ${hashes.length} transactions sent${failed.length ? `, ${failed.length} failed (first: ${failed[0]})` : ""}`);
  await pinTouched(c, hashes);
  return done;
}

/**
 * Dump Anvil hanya memuat akun yang ditulis transaksi. Yang cuma dibaca (implementasi di balik proxy, slot yang dibaca tanpa ditulis)
 * tertinggal di cache upstream dan hilang dari snapshot. Setiap akun dan slot yang dibaca transaksi pemanasan ditulis ulang dengan
 * nilainya saat ini, sehingga ikut tersimpan tanpa berubah.
 */
async function pinTouched(c: Client, hashes: Hex[]): Promise<void> {
  const touched = new Map<Address, Set<Hex>>();
  for (const hash of hashes) {
    const pre = (await anvil(c, "debug_traceTransaction", [hash, { tracer: "prestateTracer" }])) as Record<Address, { storage?: Record<Hex, Hex> }>;
    for (const [address, account] of Object.entries(pre) as [Address, { storage?: Record<Hex, Hex> }][]) {
      const slots = touched.get(address) ?? new Set<Hex>();
      for (const slot of Object.keys(account.storage ?? {}) as Hex[]) slots.add(slot);
      touched.set(address, slots);
    }
  }
  let slotCount = 0;
  const entries = [...touched];
  for (let i = 0; i < entries.length; i += 16) {
    await Promise.all(
      entries.slice(i, i + 16).map(async ([address, slots]) => {
        const [code, balance] = await Promise.all([c.getCode({ address }), c.getBalance({ address })]);
        if (code && code !== "0x") await anvil(c, "anvil_setCode", [address, code]);
        await anvil(c, "anvil_setBalance", [address, toHex(balance)]);
        for (const slot of slots) {
          const value = await c.getStorageAt({ address, slot });
          await anvil(c, "anvil_setStorageAt", [address, slot, value ?? "0x0"]);
          slotCount++;
        }
      }),
    );
  }
  console.log(`  warm: pinned ${touched.size} accounts and ${slotCount} storage slots into the snapshot`);
}

async function snapshot(): Promise<Address[]> {
  console.log("Forking the public Robinhood Chain RPC (the key, if any, stays in RPC_URL_ROBINHOOD and is not printed) …");
  const started = Date.now();
  const fork = startAnvil(["--fork-url", UPSTREAM, "--port", String(WARM_PORT), "--silent"], true);
  try {
    const c = await waitFor(WARM_PORT);
    console.log(`Forked at block ${await c.getBlockNumber()}; finding tokens with a standard ${usd.symbol} pool (the upstream keeps state about 10 minutes) …`);
    await prepareDevAccounts(c, false);
    if (!(await dealErc20(c, DEV, usd.address, 1_000_000n * UNIT))) throw new Error(`Could not fund ${usd.symbol} on the fork; cannot warm swaps.`);
    const found = (await discover(c))
      .filter((l) => !ONLY.length || ONLY.includes(l.token.symbol.toUpperCase()))
      .sort((a, b) => (PRIORITY.indexOf(a.token.symbol) + 1 || 99) - (PRIORITY.indexOf(b.token.symbol) + 1 || 99));
    console.log(`  ${found.length} token(s) with liquidity: ${found.map((l) => l.token.symbol).join(", ")}`);
    if (!found.length) throw new Error(ONLY.length ? `None of ${ONLY.join(", ")} has a usable pool right now.` : "No token has a usable pool right now; nothing to warm.");
    const live = await warm(c, found, started);
    if (!live.length) throw new Error("No token was warmed in time; nothing to save. Run again.");
    // fetch biasa: dump lebih besar dari batas respons viem.
    const res = await fetch(`http://127.0.0.1:${WARM_PORT}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_dumpState", params: [] }) });
    const hex = ((await res.json()) as { result: Hex }).result;
    const raw = Buffer.from(hex.slice(2), "hex");
    const json = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
    mkdirSync(join(ROOT, ".fork"), { recursive: true });
    writeFileSync(SNAPSHOT, json);
    writeFileSync(`${SNAPSHOT}.tokens`, live.map((l) => l.token.symbol).join(","));
    console.log(`Saved ${SNAPSHOT} (${(json.length / 1024).toFixed(0)} KB) in ${Math.round((Date.now() - started) / 1000)} s.`);
    return live.map((l) => l.token.address as Address);
  } finally {
    fork.kill();
  }
}

async function portInUse(port: number): Promise<boolean> {
  try {
    await client(port).getChainId();
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  for (const port of [PORT, WARM_PORT]) {
    if (await portInUse(port)) {
      console.error(`Port ${port} is already serving a chain (an old anvil?). Stop it first (pkill anvil), or set FORK_PORT.`);
      process.exit(1);
    }
  }
  if (process.argv.includes("--refresh") || !existsSync(SNAPSHOT)) await snapshot();
  else console.log(`Using ${SNAPSHOT} from ${statSync(SNAPSHOT).mtime.toISOString()} (pnpm fork --refresh to re-fork).`);
  const symbols = existsSync(`${SNAPSHOT}.tokens`) ? readFileSync(`${SNAPSHOT}.tokens`, "utf8") : "";

  const node = startAnvil(["--load-state", SNAPSHOT, "--port", String(PORT), "--host", "127.0.0.1", "--silent"], false);
  const c = await waitFor(PORT);
  await prepareDevAccounts(c, true);
  console.log(`
Robinhood Chain fork on http://127.0.0.1:${PORT} (chain ${chain.chainId}, block ${await c.getBlockNumber()}), no upstream.
Tokens that were warmed (swap them in the app): ${symbols || "unknown"}
Dev account ${DEV}: 10,000 ETH and 10,000 ${usd.symbol} (public test key: never use it on a real network).

Next, in another terminal:
  1. Add this line to .dev.vars (then remove it when you are done):  EVM_RPC_UPSTREAM_URL_ROBINHOOD=http://127.0.0.1:${PORT}
  2. pnpm preview:dev        (builds with the dev wallet and serves it with the relay)
  3. Open the printed address (usually http://localhost:8788) /e/robinhood/SPY and choose "Dev wallet (local fork)".

Ctrl+C to stop. State is not saved; every run starts from the snapshot.`);
  const stop = () => {
    node.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  node.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
