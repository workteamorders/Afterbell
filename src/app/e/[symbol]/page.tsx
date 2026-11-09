import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EvmTokenView } from "@/components/evm/EvmTokenView";
import { evmMetadata, lookupEvmToken } from "@/lib/evm/page";
import { EVM_TOKENS, getIssuer } from "@/lib/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return EVM_TOKENS.filter((t) => t.chain === "ethereum").map((t) => ({ symbol: t.symbol }));
}

type Params = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { symbol } = await params;
  return evmMetadata(lookupEvmToken("ethereum", symbol));
}

export default async function EvmTokenPage({ params }: Params) {
  const { symbol } = await params;
  const token = lookupEvmToken("ethereum", symbol);
  const issuer = token ? getIssuer(token.issuer) : undefined;
  if (!token || !issuer) notFound();
  return <EvmTokenView token={token} issuer={issuer} />;
}
