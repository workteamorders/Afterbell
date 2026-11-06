import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, type DocSection } from "@/components/page/DocPage";

export const metadata: Metadata = {
  title: "Risk notice",
  description: "Risks of buying and selling tokenized US stocks on Solana and Ethereum. Draft awaiting legal review.",
  alternates: { canonical: "/risk" },
};

const sections: DocSection[] = [
  {
    id: "what",
    title: "What you are buying",
    body: (
      <p>
        A tokenized stock is a token issued by a third party. It may give you price exposure to a stock without giving you the share, voting rights, or dividends. Some issuers hold the underlying shares in a vehicle, others use notes or certificates. If the issuer fails, you may be an unsecured creditor. Read the issuer&apos;s documents linked on each token page.
      </p>
    ),
  },
  {
    id: "price",
    title: "Price and liquidity",
    body: (
      <ul>
        <li>The token price can differ from the stock price, above or below.</li>
        <li>When the US market is closed, the gap can be larger and liquidity thinner.</li>
        <li>A large order can move the price. The depth meter is a snapshot, not a guarantee.</li>
        <li>You may not be able to sell at the size or time you want.</li>
        <li>Some tokens have very small pools on Ethereum. Orders above what a pool holds are refused, and small pools can move sharply.</li>
        <li>Some tokenized stocks adjust balances for corporate actions. How that interacts with a pool has not been verified by Afterbell.</li>
      </ul>
    ),
  },
  {
    id: "tech",
    title: "Technology",
    body: (
      <ul>
        <li>Solana and Ethereum transactions cannot be undone once confirmed.</li>
        <li>On Ethereum, a swap needs an approval that lets the router move your tokens. Afterbell asks for the exact amount, but approvals you grant elsewhere stay until you revoke them.</li>
        <li>Ethereum network fees can be high and are paid even when a swap fails.</li>
        <li>Smart contracts, wallets, routers, and RPC providers can fail or be attacked.</li>
        <li>A passing pre-check does not guarantee the result.</li>
        <li>You are responsible for your wallet, keys, and device.</li>
      </ul>
    ),
  },
  {
    id: "legal",
    title: "Legal and regional",
    body: (
      <ul>
        <li>Some issuers do not offer their tokens to US persons or to people in certain regions. Check the notice on each token.</li>
        <li>Rules for tokenized securities are changing. A token can be restricted or delisted.</li>
        <li>Tax treatment depends on where you live. Ask a qualified adviser.</li>
      </ul>
    ),
  },
  {
    id: "advice",
    title: "Not advice",
    body: (
      <p>
        Afterbell shows information and routes swaps. It does not give investment, legal, or tax advice, and it does not promise any return. Only trade what you can afford to lose. See also the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy</Link> notes.
      </p>
    ),
  },
];

export default function RiskPage() {
  return <DocPage eyebrow="Legal" title="Risk notice" lead="What can go wrong when you hold or trade tokenized stocks." draft sections={sections} />;
}
