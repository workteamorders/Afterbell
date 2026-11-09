import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, type DocSection } from "@/components/page/DocPage";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for Afterbell, a non-custodial interface for tokenized US stocks on Solana and Ethereum, and Stock Tokens on Robinhood Chain. Draft awaiting legal review.",
  alternates: { canonical: "/terms" },
};

const sections: DocSection[] = [
  {
    id: "service",
    title: "What Afterbell is",
    body: (
      <p>
        Afterbell is a web interface. It shows information about tokenized stocks and helps you prepare swaps that Jupiter routes. Afterbell does not hold your funds, keys, or tokens, and it is not an exchange, broker, or adviser.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Who may use it",
    body: (
      <ul>
        <li>You must be allowed by law and by the token issuer to hold and trade the token.</li>
        <li>You must not use Afterbell from a region where buying and selling are switched off, and you must not use tools to hide your location.</li>
        <li>Wallets on a blocked list cannot be used for swaps.</li>
      </ul>
    ),
  },
  {
    id: "yours",
    title: "Your responsibilities",
    body: (
      <ul>
        <li>You review each swap and approve it in your own wallet.</li>
        <li>You keep your keys and device secure.</li>
        <li>You read the issuer&apos;s terms for each token. Afterbell&apos;s summaries are not legal advice.</li>
      </ul>
    ),
  },
  {
    id: "third",
    title: "Third parties",
    body: (
      <p>
        Swaps on Solana are routed by Jupiter, swaps on Ethereum go through Uniswap v3, and swaps on Robinhood Chain go through Uniswap v4. Robinhood Chain and Stock Tokens have their own terms from Robinhood, which you accept separately and which Afterbell does not control. Afterbell is independent and is not affiliated with Robinhood. On-chain data comes from RPC providers. Their availability and terms are outside Afterbell&apos;s control. Prices, quotes, and fees come from them.
      </p>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    body: (
      <p>
        Fees are shown before you sign. See <Link href="/methodology#fees">Methodology</Link>. Network fees go to the network that processes the transaction. Afterbell charges no fee on Ethereum or Robinhood Chain swaps.
      </p>
    ),
  },
  {
    id: "liability",
    title: "No warranty and limits",
    body: (
      <p>
        The site is provided as is, without a promise that it is accurate, complete, or always available. The extent to which Afterbell is liable for losses is to be set by counsel before public launch.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: <p>These terms can change. The date of the current version will appear here once it is final.</p>,
  },
];

export default function TermsPage() {
  return <DocPage eyebrow="Legal" title="Terms of use" lead="The rules for using Afterbell, in plain language." draft sections={sections} />;
}
