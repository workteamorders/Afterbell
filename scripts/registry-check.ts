/**
 * pnpm registry:check            validasi skema + periksa on-chain (butuh jaringan ke RPC)
 * pnpm registry:check --offline  hanya validasi skema
 *
 * Pemeriksaan on-chain: setiap mint ada, dimiliki program token yang tercatat, decimals cocok.
 * Fakta kendali penerbit (freeze authority, ekstensi) dicetak apa adanya; ini fakta, bukan penilaian.
 * Ethereum: untuk setiap token di registry/evm-tokens.json, kontrak punya kode, decimals() terbaca, dan chain ID sesuai
 * konfigurasi. Alamat Uniswap v3 dan USDC juga diperiksa punya kode. Variabel EVM_RPC_URL mengganti RPC publik bawaan.
 * Skrip ini hanya MEMBACA. Tidak ada transaksi yang dikirim.
 */
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { erc20Abi } from "../src/lib/evm/abi";
import { EVM_CHAINS } from "../src/lib/evm/chains";
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

const EVM_RPC_URL = process.env.EVM_RPC_URL ?? "https://ethereum.publicnode.com";

async function evmRpc(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(EVM_RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!res.ok) throw new Error(`Ethereum RPC ${EVM_RPC_URL} answered HTTP ${res.status}. On-chain check not done.`);
  const body = (await res.json()) as { result?: string; error?: { message: string } };
  if (body.result === undefined) throw new Error(`Ethereum RPC error: ${body.error?.message ?? "no result"}`);
  return body.result;
}

async function checkEthereum(tokens: ReturnType<typeof evmTokensSchema.parse>): Promise<number> {
  const chain = EVM_CHAINS.ethereum;
  let failures = 0;
  const id = Number(BigInt(await evmRpc("eth_chainId", [])));
  if (id !== chain.chainId) {
    console.error(`FAIL Ethereum RPC reports chain ID ${id}, config says ${chain.chainId}`);
    return 1;
  }
  console.log(`OK   Ethereum chain ID ${id}`);
  const hasCode = async (address: string) => {
    const code = await evmRpc("eth_getCode", [address, "latest"]);
    return code !== "0x" && code.length > 2;
  };
  for (const [label, address] of [
    ["USDC", chain.usdc.address],
    ["Uniswap v3 QuoterV2", chain.uniswapV3.quoterV2],
    ["Uniswap v3 SwapRouter02", chain.uniswapV3.swapRouter02],
    ["Uniswap v3 Factory", chain.uniswapV3.factory],
  ] as const) {
    if (await hasCode(address)) console.log(`OK   ${label} (${address}) has contract code`);
    else {
      failures += 1;
      console.error(`FAIL ${label} (${address}) has no contract code`);
    }
  }
  const usdcDecimals = decodeFunctionResult({ abi: erc20Abi, functionName: "decimals", data: (await evmRpc("eth_call", [{ to: chain.usdc.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }) }, "latest"])) as `0x${string}` });
  if (usdcDecimals !== chain.usdc.decimals) {
    failures += 1;
    console.error(`FAIL USDC decimals on-chain ${usdcDecimals}, config ${chain.usdc.decimals}`);
  }
  for (const t of tokens) {
    try {
      if (!(await hasCode(t.address))) throw new Error("no contract code at this address");
      const d = decodeFunctionResult({ abi: erc20Abi, functionName: "decimals", data: (await evmRpc("eth_call", [{ to: t.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }) }, "latest"])) as `0x${string}` });
      console.log(`OK   ${t.symbol.padEnd(7)} ${t.address} decimals=${d} (read from the contract; Afterbell does not store it)`);
    } catch (e) {
      failures += 1;
      console.error(`FAIL ${t.symbol} (${t.address}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return failures;
}

async function main(): Promise<void> {
  const { issuers, tokens } = validateRegistry(read("issuers.json"), read("tokens.json"));
  console.log(`Schema OK: ${issuers.length} issuers, ${tokens.length} tokens. Every entry has a source URL and a last-checked date.`);
  const evmTokens = evmTokensSchema.parse(read("evm-tokens.json"));
  const unknownIssuer = evmTokens.filter((t) => !issuers.some((i) => i.id === t.issuer));
  if (unknownIssuer.length) throw new Error(`EVM tokens with unknown issuer: ${unknownIssuer.map((t) => t.symbol).join(", ")}`);
  console.log(`Schema OK: ${evmTokens.length} Ethereum tokens.`);
  if (offline) return;

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
  failures += await checkEthereum(evmTokens);
  if (failures) process.exit(1);
  console.log("On-chain check OK.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
