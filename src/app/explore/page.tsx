import type { Metadata } from "next";
import { ExploreView } from "@/components/explore/ExploreView";
import { PageHeader } from "@/components/page/PageHeader";
import Page from "@/components/page/Page.module.css";

export const metadata: Metadata = {
  title: "Explore tokenized stocks",
  description: "Browse tokenized US stocks on Solana and Ethereum. Compare issuers, what each token gives you, and how deep the liquidity is right now.",
  alternates: { canonical: "/explore" },
};

export default function ExplorePage() {
  return (
    <div className={`container ${Page.page}`}>
      <PageHeader eyebrow="Explore" title="Tokenized stocks on Solana and Ethereum" lead="Every token here comes from an issuer's own published list. Check what you hold and how deep the liquidity is before you open one." />
      <ExploreView />
    </div>
  );
}
