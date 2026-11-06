import type { Metadata } from "next";
import Link from "next/link";
import { HomeSnapshot, Pillars } from "@/components/home/HomeSnapshot";
import { Button } from "@/components/ui/Button";
import { getIssuer, TOKENS } from "@/lib/registry";
import styles from "@/components/home/Home.module.css";

export const metadata: Metadata = {
  title: { absolute: "Afterbell: buy and understand tokenized US stocks on Solana and Ethereum" },
  description:
    "See what a tokenized stock really gives you, how deep its liquidity is, whether the US market is open, and the full cost before you sign. Non-custodial, routed by Jupiter.",
  alternates: { canonical: "/" },
  openGraph: { title: "Afterbell", description: "Tokenized US stocks on Solana and Ethereum, with the facts shown before you sign.", url: "/", type: "website" },
  twitter: { card: "summary_large_image", title: "Afterbell", description: "Tokenized US stocks on Solana and Ethereum, with the facts shown before you sign." },
};

export default function HomePage() {
  const token = TOKENS[0];
  const issuer = token ? getIssuer(token.issuer) : undefined;
  return (
    <div className={`container ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="hero-h">
        <p className="type-label muted">Afterbell</p>
        <h1 id="hero-h" className="type-display">
          Tokenized US stocks, with the facts in front.
        </h1>
        <p className="type-body muted">
          Know what a token gives you, how deep the liquidity is, and what a swap will cost, before your wallet asks you to sign. Afterbell never holds your funds. It works with Solana and Ethereum wallets.
        </p>
        <div className={styles.cta}>
          <Button variant="primary" size="lg" href="/explore" icon="arrow-right" iconPosition="end">
            Explore tokens
          </Button>
          <Link href="/methodology">How it works</Link>
        </div>
      </section>
      <Pillars />
      {token && issuer ? <HomeSnapshot token={token} issuer={issuer} /> : null}
    </div>
  );
}
