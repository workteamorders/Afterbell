/**
 * pnpm registry:sync-robinhood           tulis ulang entri Robinhood Chain di registry/evm-tokens.json dari API resmi Robinhood
 * pnpm registry:sync-robinhood --check   hanya tampilkan perbedaan, tidak menulis
 *
 * Sumber: https://api.robinhood.com/rhj/assets (dokumentasi: docs.robinhood.com/chain/stock-token-apis; baca saja, tanpa
 * autentikasi, 60 permintaan per detik). Hanya aset ASSET_STATUS_ACTIVE dengan deployment di chain ID 4663, alamat EIP-55 valid,
 * dan 18 desimal yang diambil. Entri Ethereum dan kolam manual (`pools`) yang sudah ada dipertahankan.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isAddress } from "viem";
import { z } from "zod";
import { evmTokensSchema, type EvmToken } from "../src/lib/registry/evm-schema";

const URL_ = "https://api.robinhood.com/rhj/assets";
/** Hanya untuk uji lokal dengan --check: alamat API pengganti. Sumber yang ditulis ke registry selalu URL resmi di atas. */
const FETCH_URL = process.env.RHJ_ASSETS_URL ?? URL_;
const CHAIN_ID = 4663;
const SUFFIX = " • Robinhood Token";
const file = join(import.meta.dirname, "..", "registry", "evm-tokens.json");
const check = process.argv.includes("--check");

const apiSchema = z.object({
  assets: z.array(
    z
      .object({
        tokenSymbol: z.string(),
        tokenName: z.string(),
        status: z.string().optional(),
        tokenDecimals: z.number().optional(),
        deployments: z.array(z.object({ contractAddress: z.string(), chainId: z.number() }).loose()).default([]),
      })
      .loose(),
  ),
});

async function main() {
  const res = await fetch(FETCH_URL, { headers: { accept: "application/json", "user-agent": "afterbell-registry-sync" } });
  if (!res.ok) throw new Error(`Robinhood API answered HTTP ${res.status}. Nothing was changed.`);
  const { assets } = apiSchema.parse(await res.json());
  const today = new Date().toISOString().slice(0, 10);
  const source = { label: "Robinhood Stock Token API (/rhj/assets)", url: URL_ };

  const existing = evmTokensSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const oldRh = new Map(existing.filter((t) => t.chain === "robinhood").map((t) => [t.address.toLowerCase(), t]));
  const skipped: string[] = [];
  const next: EvmToken[] = [];
  for (const a of assets) {
    const dep = a.deployments.find((d) => d.chainId === CHAIN_ID);
    if (!dep) {
      skipped.push(`${a.tokenSymbol}: no deployment on chain ${CHAIN_ID}`);
      continue;
    }
    if (a.status !== "ASSET_STATUS_ACTIVE") {
      skipped.push(`${a.tokenSymbol}: status ${a.status ?? "missing"}`);
      continue;
    }
    if (!isAddress(dep.contractAddress, { strict: true })) {
      skipped.push(`${a.tokenSymbol}: address is not a valid EIP-55 address`);
      continue;
    }
    if (a.tokenDecimals !== undefined && a.tokenDecimals !== 18) {
      skipped.push(`${a.tokenSymbol}: ${a.tokenDecimals} decimals (Afterbell expects 18)`);
      continue;
    }
    const prev = oldRh.get(dep.contractAddress.toLowerCase());
    const name = a.tokenName.endsWith(SUFFIX) ? a.tokenName.slice(0, -SUFFIX.length) : a.tokenName;
    next.push({
      symbol: a.tokenSymbol,
      name,
      underlying: a.tokenSymbol,
      chain: "robinhood",
      address: dep.contractAddress,
      issuer: "robinhood",
      addressSource: source,
      ...(prev?.pools ? { pools: prev.pools } : {}),
      lastChecked: prev && prev.symbol === a.tokenSymbol && prev.name === name ? prev.lastChecked : today,
    });
  }
  const nextKeys = new Set(next.map((t) => t.address.toLowerCase()));
  const added = next.filter((t) => !oldRh.has(t.address.toLowerCase()));
  const removed = [...oldRh.values()].filter((t) => !nextKeys.has(t.address.toLowerCase()));
  console.log(`API lists ${assets.length} assets; ${next.length} usable on Robinhood Chain.`);
  console.log(`Added (${added.length}): ${added.map((t) => t.symbol).join(", ") || "none"}`);
  console.log(`Removed (${removed.length}): ${removed.map((t) => t.symbol).join(", ") || "none"}`);
  for (const s of skipped) console.log(`Skipped ${s}`);
  const all = evmTokensSchema.parse([...existing.filter((t) => t.chain !== "robinhood"), ...next]);
  // lastChecked diperbarui hanya untuk entri baru atau yang berubah; seluruh tanggal periksa mengikuti hari sinkronisasi untuk yang sama.
  if (check) return console.log("--check: nothing written.");
  writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
  console.log(`Wrote ${file}. Review the diff, then run: pnpm registry:check`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
