import type { Metadata } from "next";
import { PageHeader } from "@/components/page/PageHeader";
import Page from "@/components/page/Page.module.css";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "See the tokenized stocks in your Solana wallet, read straight from the chain, plus the swaps you confirmed in this visit.",
  alternates: { canonical: "/portfolio" },
};

export default function PortfolioPage() {
  return (
    <div className={`container ${Page.page}`}>
      <PageHeader eyebrow="Portfolio" title="What you hold" lead="Read from the chain each time you open this page. Afterbell stores nothing about your balances." />
      <PortfolioView />
    </div>
  );
}
