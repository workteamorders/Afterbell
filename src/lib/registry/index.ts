import issuersJson from "../../../registry/issuers.json";
import tokensJson from "../../../registry/tokens.json";
import evmTokensJson from "../../../registry/evm-tokens.json";
import { evmTokensSchema, type EvmToken } from "./evm-schema";
import { validateRegistry, type Issuer, type Token } from "./schema";

/** Registry dimuat dan divalidasi saat build dan saat dipakai. Entri yang tidak valid menggagalkan build. */
const data = validateRegistry(issuersJson, tokensJson);

export const ISSUERS: readonly Issuer[] = data.issuers;
export const TOKENS: readonly Token[] = data.tokens;

export const EVM_TOKENS: readonly EvmToken[] = (() => {
  const rows = evmTokensSchema.parse(evmTokensJson);
  const ids = new Set(ISSUERS.map((i) => i.id));
  for (const t of rows) if (!ids.has(t.issuer)) throw new Error(`EVM token ${t.symbol} refers to unknown issuer "${t.issuer}"`);
  return rows;
})();

export function getEvmToken(symbol: string, chain = "ethereum"): EvmToken | undefined {
  return EVM_TOKENS.find((t) => t.chain === chain && t.symbol.toLowerCase() === symbol.toLowerCase());
}

export function getToken(symbol: string): Token | undefined {
  return TOKENS.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
}

export function getIssuer(id: string): Issuer | undefined {
  return ISSUERS.find((i) => i.id === id);
}

export function getTokenByMint(mint: string): Token | undefined {
  return TOKENS.find((t) => t.mint === mint);
}

export type { Issuer, Token, EvmToken };
