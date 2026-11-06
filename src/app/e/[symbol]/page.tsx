import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EvmTokenView } from "@/components/evm/EvmTokenView";
import { EVM_TOKENS, getEvmToken, getIssuer } from "@/lib/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return EVM_TOKENS.map((t) => ({ symbol: t.symbol }));
}

type Params = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { symbol } = await params;
  const token = getEvmToken(symbol);
  if (!token) return { title: "Token not found" };
  const issuer = getIssuer(token.issuer);
  const title = `${token.symbol} on Ethereum: ${token.name}`;
  const description = `What you hold with ${token.symbol}${issuer ? ` from ${issuer.name}` : ""}, how deep its Ethereum liquidity is, whether the US market is open, and the full cost of a swap before you sign.`;
  return {
    title,
    description,
    alternates: { canonical: `/e/${token.symbol}` },
    openGraph: { title: `${title} · Afterbell`, description, url: `/e/${token.symbol}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} · Afterbell`, description },
  };
}

export default async function EvmTokenPage({ params }: Params) {
  const { symbol } = await params;
  const token = getEvmToken(symbol);
  const issuer = token ? getIssuer(token.issuer) : undefined;
  if (!token || !issuer) notFound();
  return <EvmTokenView token={token} issuer={issuer} />;
}
