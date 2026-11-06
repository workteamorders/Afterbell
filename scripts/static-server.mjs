// Server statis kecil untuk folder out/ (ekspor Next). Memetakan /path ke /path.html seperti Cloudflare Pages.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json", ".ico": "image/x-icon" };

async function pick(path) {
  const clean = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
  const candidates = [clean, `${clean}.html`, join(clean, "index.html")];
  for (const c of candidates) {
    try {
      const f = join(root, c);
      if ((await stat(f)).isFile()) return f;
    } catch {}
  }
  return null;
}

const word = (n) => BigInt(n).toString(16).padStart(64, "0");
/** Jawaban EVM contoh (bukan harga atau saldo nyata): decimals 18, kuotasi hanya untuk tingkat 0,30%, 1 token = 250 USDC. */
function evmMock(b) {
  const ok = (result) => ({ jsonrpc: "2.0", id: b.id, result });
  const err = (message) => ({ jsonrpc: "2.0", id: b.id, error: { code: 3, message } });
  if (b.method === "eth_chainId") return ok("0x1");
  if (b.method !== "eth_call") return err("Method not found");
  const data = String(b.params?.[0]?.data ?? "0x");
  if (data.startsWith("0x313ce567")) return ok("0x" + word(18)); // decimals()
  if (data.startsWith("0xc6a5026a")) {
    // quoteExactInputSingle((tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96))
    const body = data.slice(10);
    const amountIn = BigInt("0x" + body.slice(128, 192));
    const fee = BigInt("0x" + body.slice(192, 256));
    if (fee !== 3000n) return err("execution reverted");
    const usd = Number(amountIn) / 1e6;
    const out = BigInt(Math.floor((usd / 250) * (1 - (0.00002 * usd) / 100) * 1e9)) * 10n ** 9n;
    return ok("0x" + word(out) + word(0) + word(0) + word(100000));
  }
  return err("execution reverted");
}

/** MOCK=1: jaringan palsu untuk Lighthouse/tinjauan (data contoh). Menjawab /api/rpc dan /mock/jup/order. */
function mock(req, res, url) {
  const send = (body, status = 200) => {
    res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/api/rpc") {
    if (req.method === "GET") return send({ country: "US", blocked: false }), true;
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const b = JSON.parse(raw || "{}");
      if (url.searchParams.get("chain") === "ethereum") return send(evmMock(b)), undefined;
      send({ jsonrpc: "2.0", id: b.id, result: { context: { slot: 1 }, value: null } });
    });
    return true;
  }
  if (url.pathname === "/mock/jup/order") {
    const usd = Number(url.searchParams.get("amount") ?? "0") / 1e6;
    const out = Math.floor((usd / 250) * (1 - 0.00002 * usd / 100) * 1e8);
    send({ inputMint: url.searchParams.get("inputMint"), outputMint: url.searchParams.get("outputMint"), inAmount: url.searchParams.get("amount"), outAmount: String(out), router: "jupiterz", priceImpact: 0 });
    return true;
  }
  return false;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (process.env.MOCK === "1" && mock(req, res, url)) return;
  let file = await pick(url.pathname);
  let status = 200;
  if (!file) {
    file = join(root, "404.html");
    status = 404;
  }
  try {
    const body = await readFile(file);
    res.writeHead(status, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`serving out/ on ${port}`));
