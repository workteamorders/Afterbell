import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, type DocSection } from "@/components/page/DocPage";
import Page from "@/components/page/Page.module.css";
import { THRESHOLDS, NOTIONALS_USD } from "@/lib/liquidity";
import { ISSUERS } from "@/lib/registry";

export const metadata: Metadata = {
  title: "Methodology",
  description: "How Afterbell labels what you hold, measures liquidity depth, tells you if the US market is open, and shows fees. Every rule and limit in plain words.",
  alternates: { canonical: "/methodology" },
};

const sections: DocSection[] = [
  {
    id: "rights",
    title: "What you hold",
    body: (
      <>
        <p>
          A tokenized stock is not the same thing as a share. What the token gives you depends on who issued it and how it is built. Afterbell shows a plain label and a short summary for each issuer, taken from the issuer&apos;s own public documents.
        </p>
        <ul>
          <li>Each label links to the sources it came from, with the date we last checked them.</li>
          <li>The summary is an editorial reading, not legal advice. The issuer&apos;s documents are the source of truth.</li>
          <li>Issuers can change their terms. If the date looks old, read the source first.</li>
          <li>Where an issuer limits who may hold or buy, we show that before you act.</li>
        </ul>
        <div className={Page.tableWrap}>
          <table>
            <caption className="sr-only">Issuers in the registry</caption>
            <thead>
              <tr>
                <th scope="col">Issuer</th>
                <th scope="col">Label</th>
                <th scope="col">Last checked</th>
              </tr>
            </thead>
            <tbody>
              {ISSUERS.map((i) => (
                <tr key={i.id}>
                  <th scope="row">{i.name}</th>
                  <td>{i.rightsLabel}</td>
                  <td>{i.lastChecked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The registry is open. Issuers are in <code>registry/issuers.json</code> and tokens in <code>registry/tokens.json</code>. An entry without a source and a check date does not pass validation, and every mint address is checked on-chain with <code>pnpm registry:check</code>.
        </p>
      </>
    ),
  },
  {
    id: "liquidity",
    title: "Liquidity depth",
    body: (
      <>
        <p>
          The depth meter asks Jupiter for three buy quotes: ${NOTIONALS_USD[0].toLocaleString("en-US")}, ${NOTIONALS_USD[1].toLocaleString("en-US")}, and ${NOTIONALS_USD[2].toLocaleString("en-US")} of USDC into the token. For each one we compute the effective price, meaning USDC paid per token received.
        </p>
        <p>
          The impact at each size is how much worse its effective price is than the ${NOTIONALS_USD[0]} price. If a bigger order gets a better price, we show 0.
        </p>
        <ul>
          <li>
            <strong>Deep</strong>: under {THRESHOLDS.deepBelowPct}% at ${NOTIONALS_USD[2].toLocaleString("en-US")}.
          </li>
          <li>
            <strong>Medium</strong>: under {THRESHOLDS.mediumBelowPct}% at ${NOTIONALS_USD[2].toLocaleString("en-US")}.
          </li>
          <li>
            <strong>Thin</strong>: {THRESHOLDS.mediumBelowPct}% or more at ${NOTIONALS_USD[2].toLocaleString("en-US")}.
          </li>
        </ul>
        <p>
          These thresholds are starting values. They were chosen from the slippage range commonly reported for these tokens during US market hours, not fitted to a data set. We will change them as we collect evidence, and this page will change with them.
        </p>
        <p>
          Why not use Jupiter&apos;s own price impact? Some routes quote a firm price from a market maker and report an impact near zero, which would make every token look deep. Comparing effective prices works for every route.
        </p>
        <p>
          Quotes are cached for about 10 seconds and shared between requests, so many visitors do not multiply the load. A quote is a snapshot. It is not a promise that you will get that price.
        </p>
      </>
    ),
  },
  {
    id: "market",
    title: "US market status",
    body: (
      <>
        <p>
          Afterbell works out whether the US market is open on your device. It uses the regular NYSE session, 09:30 to 16:00 New York time on weekdays, and a built-in list of NYSE holidays and early closes.
        </p>
        <ul>
          <li>The holiday list covers 2026 to 2028. Outside that range we say the hours are unknown rather than guess.</li>
          <li>The tokens trade on Solana around the clock. When the US market is closed, there is no live stock price to anchor to, so the token price follows on-chain demand and can drift from the last stock price.</li>
          <li>We do not show pre-market or after-hours stock prices.</li>
        </ul>
      </>
    ),
  },
  {
    id: "premium",
    title: "Premium and discount",
    body: (
      <>
        <p>
          Premium or discount means how far the token trades above or below the stock it tracks. We show it only when we have a free, licensed source for the stock price. We do not scrape prices from websites.
        </p>
        <p>
          Right now we have no such source, so the page says &ldquo;Not available&rdquo;. A missing number is more honest than a guessed one.
        </p>
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    body: (
      <>
        <p>Before you sign, the review screen lists every cost we know about:</p>
        <ul>
          <li>
            <strong>Network fee</strong>: paid in SOL to Solana validators. Neither Afterbell nor Jupiter receives it.
          </li>
          <li>
            <strong>Afterbell fee</strong>: a small fee in basis points (1 bps is 0.01%). It is shown only when Jupiter&apos;s own quote confirms that it applies. If the quote does not confirm it, we show 0 and do not charge it. Per Jupiter&apos;s published terms, Jupiter keeps 20% of an integrator fee.
          </li>
          <li>
            <strong>Jupiter platform fee</strong>: charged by Jupiter on some routes. Afterbell does not receive it.
          </li>
          <li>
            <strong>Price impact and slippage</strong>: price impact is Jupiter&apos;s estimate. Slippage tolerance is the most the price may move against you before the swap is cancelled. Your minimum received is shown.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ethereum",
    title: "Ethereum swaps",
    body: (
      <>
        <p>
          Tokens listed under &ldquo;Ethereum&rdquo; trade through Uniswap v3 on Ethereum mainnet. The rules above apply with these differences:
        </p>
        <ul>
          <li>
            <strong>Route</strong>: a single Uniswap v3 pool. Afterbell asks Uniswap&apos;s on-chain quoter for the standard fee tiers (0.01%, 0.05%, 0.3%, 1%) and uses the one that pays the most. A pool with a different fee tier would not be found.
          </li>
          <li>
            <strong>Depth</strong>: measured the same way, with Uniswap quotes. Where the pool cannot fill an order size at all, the page says so instead of showing a number.
          </li>
          <li>
            <strong>Decimals</strong>: read from the token contract when you open the page, not typed into the registry.
          </li>
          <li>
            <strong>Approval</strong>: Uniswap must be allowed to move your tokens. Afterbell asks for the exact amount of that swap, not unlimited access. It is a separate transaction that costs a network fee, and you may see two wallet requests.
          </li>
          <li>
            <strong>Network fee</strong>: paid in ETH to Ethereum validators and estimated from the simulation and the current gas price. It can be high when the network is busy, and a failed swap still costs it.
          </li>
          <li>
            <strong>Afterbell fee</strong>: 0 bps on Ethereum.
          </li>
          <li>
            <strong>Price impact</strong>: not shown on the review screen, because the quoter reports no market reference price. Use the depth meter.
          </li>
          <li>
            <strong>Checks</strong>: the approval and the swap are each run as a read-only call from your address before your wallet is asked to sign. A pass is a check, not a guarantee.
          </li>
        </ul>
        <p>
          The token list for Ethereum is in <code>registry/evm-tokens.json</code>. Each contract address carries its source and check date. Some of these tokens adjust balances for corporate actions, and how that interacts with a Uniswap pool has not been verified by Afterbell.
        </p>
      </>
    ),
  },
  {
    id: "safety",
    title: "Checks before you sign",
    body: (
      <>
        <ol>
          <li>Afterbell asks Jupiter for a quote that includes your wallet address.</li>
          <li>It runs the transaction as a simulation on Solana. Nothing is sent. If the simulation fails, we say why and you do not sign.</li>
          <li>Your wallet shows its own approval request. Only you can sign, and Afterbell never sees your keys.</li>
          <li>The signed transaction goes to Jupiter for sending. If the result is unclear, we check the status on-chain and give you an explorer link.</li>
        </ol>
        <p>
          A passing simulation is a check, not a guarantee. Prices can move between the check and the moment the swap lands.
        </p>
      </>
    ),
  },
  {
    id: "limits",
    title: "What Afterbell does not do",
    body: (
      <>
        <ul>
          <li>It does not hold your funds, keys, or tokens.</li>
          <li>It does not give investment advice or rate tokens.</li>
          <li>It does not show balances that sit outside a wallet&apos;s standard token account. See <Link href="/help#balances">Help</Link>.</li>
          <li>It does not stay available in every region. Where buying and selling are off, you can still read everything.</li>
          <li>It does not yet cover every tokenized stock. A token appears only after its mint or contract address comes from an official issuer source.</li>
        </ul>
      </>
    ),
  },
];

export default function MethodologyPage() {
  return (
    <DocPage
      eyebrow="Methodology"
      title="How Afterbell works out what it shows"
      lead="Every label, number, and limit on the site, with the rule behind it. If a rule changes, this page changes."
      sections={sections}
    />
  );
}
