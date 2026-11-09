import type { Metadata } from "next";
import { evmTokenPath, getEvmChain } from "./chains";
import { getEvmToken, getIssuer, type EvmToken } from "../registry";

/** Metadata halaman token EVM. Teks Robinhood memakai "Stock Token", sesuai syarat penggunaan nama oleh Robinhood. */
export function evmMetadata(token: EvmToken | undefined): Metadata {
  if (!token) return { title: "Token not found" };
  const chain = getEvmChain(token.chain);
  const issuer = getIssuer(token.issuer);
  const title = `${token.symbol} on ${chain?.name ?? token.chain}: ${token.name}`;
  const description = `What you hold with ${token.symbol}${issuer ? ` from ${issuer.name}` : ""}, how deep its ${chain?.name ?? ""} liquidity is, whether the US market is open, and the full cost of a swap before you sign.`;
  const path = evmTokenPath(token);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · Afterbell`, description, url: path, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} · Afterbell`, description },
  };
}

export function lookupEvmToken(chain: string, symbol: string): EvmToken | undefined {
  return getEvmToken(symbol, chain);
}
