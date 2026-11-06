import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TokenView } from "@/components/token/TokenView";
import { getIssuer, getToken, TOKENS } from "@/lib/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOKENS.map((t) => ({ symbol: t.symbol }));
}

type Params = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { symbol } = await params;
  const token = getToken(symbol);
  if (!token) return { title: "Token not found" };
  const issuer = getIssuer(token.issuer);
  const title = `${token.symbol}: ${token.name}`;
  const description = `What you hold with ${token.symbol}${issuer ? ` from ${issuer.name}` : ""}, how deep its Solana liquidity is, whether the US market is open, and the full cost of a swap before you sign.`;
  return {
    title,
    description,
    alternates: { canonical: `/s/${token.symbol}` },
    openGraph: { title: `${title} · Afterbell`, description, url: `/s/${token.symbol}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} · Afterbell`, description },
  };
}

export default async function TokenPage({ params }: Params) {
  const { symbol } = await params;
  const token = getToken(symbol);
  const issuer = token ? getIssuer(token.issuer) : undefined;
  if (!token || !issuer) notFound();
  return <TokenView token={token} issuer={issuer} />;
}
