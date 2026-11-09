import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Memeriksa folder out/ (yang dikirim ke browser) untuk jejak rahasia.
 * Gagal bila ada pola kunci/token yang dikenal, URL RPC berkunci, atau nama variabel rahasia.
 */
const OUT = process.argv[2] ?? "out";

const PATTERNS: Array<[string, RegExp]> = [
  ["Dev wallet code (build without NEXT_PUBLIC_DEV_WALLET before deploying)", /dev-wallet\.afterbell\.local/],
  ["RPC upstream env name", /RPC_UPSTREAM_URL/],
  ["Jupiter API key header", /x-api-key/i],
  ["URL with api-key query", /[?&](api[-_]?key|apikey|key|token)=[A-Za-z0-9_-]{8,}/i],
  ["Helius/QuickNode/Alchemy/Triton URL", /(helius-rpc|helius\.xyz|quiknode\.pro|alchemy\.com|rpcpool\.com)/i],
  ["PEM private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Solana secret key array (64 numbers)", /\[(\s*\d{1,3}\s*,){63}\s*\d{1,3}\s*\]/],
  ["Cloudflare API token", /\bcf[-_]?api[-_]?token\b/i],
  ["Generic secret assignment", /(secret|private_key|privatekey)\s*[:=]\s*["'][A-Za-z0-9+/_-]{16,}["']/i],
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|css|html|txt|json|xml|map|svg)$/.test(name)) yield p;
  }
}

let files = 0;
const hits: string[] = [];
for (const f of walk(OUT)) {
  files++;
  const text = readFileSync(f, "utf8");
  for (const [label, re] of PATTERNS) {
    const m = re.exec(text);
    if (m) hits.push(`${f}: ${label} (${m[0].slice(0, 40).replace(/\s+/g, " ")})`);
  }
}
console.log(`Scanned ${files} files in ${OUT}/`);
if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("No secret patterns found.");
